import { Collection, MessageFlags, type Client, type Message, type SendableChannels } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { publishPersistentPanel } from "../../../src/modules/panels/persistentPanel";
import { createPanelStorage } from "../../helpers/panelStorage";

function setup() {
  const messages = new Collection<string, Message>();
  const edit = vi.fn().mockResolvedValue(undefined);
  const makeMessage = (id: string, author = "bot", content = "panel") => ({ id, author: { id: author }, content, components: [], edit, delete: vi.fn() }) as unknown as Message;
  const fetch = vi.fn().mockImplementation((options: { message?: string }) => options.message
    ? messages.has(options.message) ? Promise.resolve(messages.get(options.message)) : Promise.reject({ code: 10008 })
    : Promise.resolve(messages));
  let sequence = 0;
  const send = vi.fn().mockImplementation(() => {
    const message = makeMessage(`sent-${++sequence}`);
    messages.set(message.id, message);
    return Promise.resolve(message);
  });
  const channel = { id: "channel", messages: { fetch }, send } as unknown as SendableChannels;
  const storage = createPanelStorage();
  const client = { user: { id: "bot" }, panelStorage: storage } as unknown as Client;
  const options = { matches: (message: Message) => message.content === "panel", payload: { content: "panel", flags: MessageFlags.IsComponentsV2 as const } };
  const publish = () => publishPersistentPanel(client, channel, "rules", options);
  return { client, storage, channel, options, messages, makeMessage, edit, send, fetch, publish };
}

describe("database-backed persistent panels", () => {
  it("saves sent IDs and recovers after restart with a forced direct fetch and no history scan", async () => {
    const f = setup();
    await f.publish();
    f.fetch.mockClear();
    await publishPersistentPanel({ ...f.client } as Client, f.channel, "rules", f.options);
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith({ message: "sent-1", force: true });
    expect(f.edit).toHaveBeenCalledWith(expect.objectContaining({ content: "panel", attachments: [], embeds: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }));
  });

  it("imports an existing panel and then stops reading history", async () => {
    const f = setup();
    f.messages.set("old", f.makeMessage("old"));
    await f.publish();
    f.fetch.mockClear();
    await f.publish();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith({ message: "old", force: true });
  });

  it("recreates only confirmed deleted messages and persists the replacement", async () => {
    const f = setup();
    await f.publish();
    f.messages.clear();
    await f.publish();
    f.fetch.mockClear();
    await f.publish();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith({ message: "sent-2", force: true });
  });

  it.each(["Forbidden", "network unavailable"])("never sends a replacement after %s", async (reason) => {
    const f = setup();
    await f.publish();
    f.fetch.mockRejectedValueOnce(new Error(reason));
    await expect(f.publish()).rejects.toThrow(reason);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("does not publish when database access fails or is unconfigured", async () => {
    const f = setup();
    await expect(publishPersistentPanel({ ...f.client, panelStorage: undefined } as Client, f.channel, "rules", f.options)).rejects.toThrow("DATABASE_URL");
    f.client.panelStorage = { withPanel: () => Promise.reject(new Error("database unavailable")) };
    await expect(f.publish()).rejects.toThrow("database unavailable");
    expect(f.send).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("stops before sending if the initial empty discovery cannot be saved", async () => {
    const f = setup();
    f.client.panelStorage = { withPanel: async (_channel, _key, task) => task({ get: () => Promise.resolve(null), save: () => Promise.reject(new Error("write failed")) }) };
    await expect(f.publish()).rejects.toThrow("write failed");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("reports failed post-send persistence instead of marking publication successful", async () => {
    const f = setup();
    const save = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("save failed"));
    f.client.panelStorage = { withPanel: async (_channel, _key, task) => task({ get: () => Promise.resolve(null), save }) };
    await expect(f.publish()).rejects.toThrow("save failed");
    expect(save).toHaveBeenLastCalledWith("sent-1", undefined);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("keeps independent panel slots in the same channel", async () => {
    const f = setup();
    await f.storage.withPanel("channel", "server-info", async (stored) => { await stored.save(null); });
    await f.storage.withPanel("channel", "server-info-continuation", async (stored) => { await stored.save(null); });
    await publishPersistentPanel(f.client, f.channel, "server-info", f.options);
    await publishPersistentPanel(f.client, f.channel, "server-info-continuation", f.options);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it("coalesces overlapping publishers using shared storage", async () => {
    const f = setup();
    await Promise.all([f.publish(), publishPersistentPanel({ ...f.client } as Client, f.channel, "rules", f.options)]);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("does not adopt human or webhook messages during migration", async () => {
    const f = setup();
    f.messages.set("human", f.makeMessage("human", "human"));
    f.messages.set("webhook", { ...f.makeMessage("webhook"), webhookId: "webhook" } as Message);
    await f.publish();
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("rejects a saved message owned by another account without posting or editing it", async () => {
    const f = setup();
    await f.publish();
    f.messages.set("sent-1", f.makeMessage("sent-1", "human"));
    await expect(f.publish()).rejects.toThrow("not a recognized panel");
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.edit).not.toHaveBeenCalled();
  });

  it("recovers deletion between fetch and edit", async () => {
    const f = setup();
    await f.publish();
    f.edit.mockRejectedValueOnce({ code: 10008 });
    await f.publish();
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it("never treats an edit permission error as deletion", async () => {
    const f = setup();
    await f.publish();
    f.edit.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(f.publish()).rejects.toThrow("Forbidden");
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("remembers render keys across restart while still checking whether the message exists", async () => {
    const f = setup();
    const options = { ...f.options, renderKey: "storm-cycle:upcoming" };
    await publishPersistentPanel(f.client, f.channel, "storm", options);
    await publishPersistentPanel({ ...f.client } as Client, f.channel, "storm", options);
    expect(f.edit).not.toHaveBeenCalled();
    expect(f.fetch).toHaveBeenLastCalledWith({ message: "sent-1", force: true });
    await publishPersistentPanel(f.client, f.channel, "storm", { ...options, renderKey: "storm-cycle:active" });
    expect(f.edit).toHaveBeenCalledOnce();
  });

  it("fails closed when the bounded history import cannot finish", async () => {
    const f = setup();
    f.fetch.mockResolvedValue(new Collection(Array.from({ length: 100 }, (_, i) => [String(i), f.makeMessage(String(i), "human")])));
    await expect(f.publish()).rejects.toThrow("exceeded 10,000 messages");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("skips redundant artwork generation but allows explicit refreshes with the same render key", async () => {
    const f = setup();
    const payload = vi.fn(() => f.options.payload);
    const options = { ...f.options, payload, renderKey: "same-cycle" };
    await publishPersistentPanel(f.client, f.channel, "storm", options);
    await publishPersistentPanel(f.client, f.channel, "storm", options);
    expect(payload).toHaveBeenCalledOnce();
    expect(f.edit).not.toHaveBeenCalled();
    await publishPersistentPanel(f.client, f.channel, "storm", { ...options, forceRefresh: true });
    expect(f.edit).toHaveBeenCalledOnce();
    expect(payload).toHaveBeenCalledTimes(2);
  });
});
