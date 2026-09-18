import { Collection, type Client, type MessageCreateOptions } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStormPanel, createStormAnnouncer, parseCoriolisEnd, readStormChannelId, stormWindowFromEnd } from "../../../../src/modules/world/storms/stormAnnouncement";

const channelId = "123456789012345678";
const end = Date.parse("2026-09-15T11:00:00Z");
const start = end - 24 * 60 * 60 * 1000;
afterEach(() => vi.unstubAllEnvs());

function setup(apiEnd = end) {
  vi.stubEnv("DISCORD_SHARD_ID", "0");
  const history = new Collection<string, { id: string; createdTimestamp: number; author: { id: string }; components: MessageCreateOptions["components"]; edit: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }>();
  const edit = vi.fn().mockResolvedValue(undefined);
  const fetchHistory = vi.fn().mockImplementation((options: unknown) => typeof options === "string" ?
    history.has(options) ? Promise.resolve(history.get(options)) : Promise.reject({ code: 10008 }) : Promise.resolve(history));
  const send = vi.fn().mockImplementation((payload: MessageCreateOptions) => {
    const id = String(history.size + 1);
    history.set(id, { id, createdTimestamp: Date.now(), author: { id: "bot" }, components: payload.components, edit, delete: vi.fn() });
    return Promise.resolve(history.get(id));
  });
  const call = vi.fn().mockResolvedValue({ coriolisNextCycleAt: new Date(apiEnd).toISOString() });
  const client = { user: { id: "bot" }, duneApi: { call }, channels: { fetch: vi.fn().mockResolvedValue({ isSendable: () => true, messages: { fetch: fetchHistory }, send }) } } as unknown as Client;
  return { client, call, fetchHistory, history, send, edit };
}

describe("API-backed Coriolis storm announcements", () => {
  it("calculates the start exactly 24 hours before the API end", () => {
    expect(stormWindowFromEnd(end)).toEqual({ start, end });
    expect(parseCoriolisEnd({ coriolisNextCycleAt: new Date(end).toISOString() })).toBe(end);
    expect(parseCoriolisEnd({ coriolisNextCycleAt: end / 1000 })).toBe(end);
    expect(parseCoriolisEnd({ coriolisNextCycleAt: end })).toBe(end);
  });

  it("validates the dedicated channel and API value", () => {
    expect(readStormChannelId({})).toBeNull();
    expect(readStormChannelId({ STORM_CHANNEL_ID: channelId })).toBe(channelId);
    expect(() => parseCoriolisEnd({})).toThrow("did not return");
    expect(() => parseCoriolisEnd({ coriolisNextCycleAt: "bad" })).toThrow("invalid");
  });

  it("includes the live API window, banner, and countdowns", () => {
    const panel = buildStormPanel(start, end, start - 1);
    const json = JSON.stringify(panel.components);
    expect(json).toContain("attachment://coriolis-storm.png");
    expect(json).toContain(`<t:${start / 1000}:F>`);
    expect(json).toContain(`<t:${end / 1000}:F>`);
    expect(json).not.toContain("API cycle end");
    expect(json).not.toContain("Live Console schedule");
    expect(json).not.toContain("Coriolis end");
    expect(panel.files).toHaveLength(1);
  });

  it("reads lightweight map markers and sends each API cycle once", async () => {
    const { client, call, send } = setup();
    const announce = createStormAnnouncer(client, channelId);
    await announce(start - 60_000);
    await announce(start - 30_000);
    expect(call).toHaveBeenCalledWith("GET", "/api/map/markers", { query: { static: 0 } });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("restores a missing panel during the cycle and stops after it ends", async () => {
    const { client, history, send } = setup();
    const announce = createStormAnnouncer(client, channelId);
    await announce(start);
    expect(send).toHaveBeenCalledTimes(1);
    history.clear();
    await announce(start + 60_000);
    expect(send).toHaveBeenCalledTimes(2);
    await announce(end);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("recognizes its own prior panel after restart", async () => {
    const { client, fetchHistory, send, edit } = setup();
    fetchHistory.mockResolvedValue(new Collection([["1", { id: "1", createdTimestamp: start - 1000, author: { id: "bot" }, edit, components: [{ content: `Coriolis end ${end / 1000}` }] }]]));
    await createStormAnnouncer(client, channelId)(start - 60_000);
    expect(send).not.toHaveBeenCalled();
    expect(edit).toHaveBeenCalledOnce();
  });

  it("retries API, history, and send failures", async () => {
    const { client, call, fetchHistory, send } = setup();
    const announce = createStormAnnouncer(client, channelId);
    call.mockRejectedValueOnce(new Error("api unavailable"));
    await expect(announce(start - 60_000)).rejects.toThrow("api unavailable");
    fetchHistory.mockRejectedValueOnce(new Error("history unavailable"));
    await expect(announce(start - 60_000)).rejects.toThrow("history unavailable");
    send.mockRejectedValueOnce(new Error("send unavailable"));
    await expect(announce(start - 60_000)).rejects.toThrow("send unavailable");
    await announce(start - 60_000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("updates the same panel across storm phases and subsequent cycles", async () => {
    const { client, call, send, edit } = setup();
    const announce = createStormAnnouncer(client, channelId);
    await announce(start - 1);
    await announce(start);
    expect(JSON.stringify(edit.mock.lastCall)).toContain("Storm underway");
    await announce(end);
    expect(JSON.stringify(edit.mock.lastCall)).toContain("Awaiting the next cycle");
    call.mockResolvedValue({ coriolisNextCycleAt: end + 7 * 86400000 });
    await announce(end + 1);
    expect(JSON.stringify(edit.mock.lastCall)).toContain("Next storm approaching");
    expect(send).toHaveBeenCalledOnce();
  });

  it("removes duplicate bot storm panels without deleting other messages", async () => {
    const { client, history, send, edit } = setup();
    const remove = vi.fn();
    const unrelated = vi.fn();
    const old = { id: "old", createdTimestamp: start, author: { id: "bot" }, components: buildStormPanel(start, end).components, edit, delete: vi.fn() };
    history.set("new", { ...old, id: "new", delete: remove });
    history.set("human", { ...old, id: "human", author: { id: "human" }, delete: unrelated });
    history.set("old", old);
    await createStormAnnouncer(client, channelId)(start - 1);
    expect(remove).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
