import { Collection, ComponentType, type Client, type ButtonInteraction, type ModalSubmitInteraction, type Interaction } from "discord.js";
import { expect, it, vi } from "vitest";
import { MusicPanelPublisher, musicPanel } from "../../../src/modules/music/musicPanel";
import { handleMusicInteraction } from "../../../src/modules/music/musicInteractions";
import { isKnownComponentInteraction } from "../../../src/support/interactions/componentCustomIds";
import { MUSIC_BUTTON_ACTIONS } from "../../../src/modules/music/musicPanel";

it("routes all panel controls and forms past the unavailable-component fallback", () => {
  for (const customId of [...MUSIC_BUTTON_ACTIONS.map((action) => `music:${action}`), "music:cancel", "music-confirm:clear", "music-confirm:stop", "music-edit:request", "music-edit:volume"]) {
    expect(isKnownComponentInteraction({ customId, isButton: () => !customId.startsWith("music-edit:"), isAnySelectMenu: () => false,
      isModalSubmit: () => customId.startsWith("music-edit:") } as unknown as Interaction)).toBe(true);
  }
});

it("reuses a panel buried below a full page of requests and coalesces publications", async () => {
  const edit = vi.fn();
  const history = new Collection(Array.from({ length: 100 }, (_, i) => [String(i), { id: String(i), author: { id: "listener" }, components: [] }]));
  const fetch = vi.fn().mockResolvedValueOnce(history).mockResolvedValueOnce(new Collection([["panel", {
    author: { id: "bot" }, components: musicPanel("voice").components, edit,
  }]]));
  const send = vi.fn();
  const client = { user: { id: "bot" }, channels: { fetch: vi.fn().mockResolvedValue({
    isTextBased: () => true, isSendable: () => true, isDMBased: () => false, messages: { fetch }, send,
  }) } };
  const publisher = new MusicPanelPublisher(client as unknown as Client, "requests", "voice");
  await Promise.all([publisher.publish(), publisher.publish()]);
  expect(fetch).toHaveBeenNthCalledWith(2, { limit: 100, before: "99" });
  expect(edit).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
});

it("does not create a duplicate when history cannot be read", async () => {
  const send = vi.fn();
  const client = { channels: { fetch: vi.fn().mockResolvedValue({ isTextBased: () => true, isSendable: () => true,
    isDMBased: () => false, messages: { fetch: vi.fn().mockRejectedValue(new Error("Forbidden")) }, send }) } };
  const publisher = new MusicPanelPublisher(client as unknown as Client, "requests", "voice");
  await expect(publisher.publish()).rejects.toThrow("Forbidden");
  expect(publisher.ready).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

function interaction(customId: string, modal = false) {
  const musicInteraction = vi.fn();
  const service = { authorize: vi.fn(), waitUntilReady: vi.fn().mockResolvedValue(undefined), requireRequester: vi.fn(), requireOwnerRole: vi.fn(), action: vi.fn(), request: vi.fn().mockResolvedValue("Queued"),
    lyricsMessage: vi.fn().mockReturnValue({ content: "Lyrics link", components: [] }), describeQueue: vi.fn().mockReturnValue("Queue"), errorMessage: () => "Join the music voice channel.",
    auditSnapshot: vi.fn().mockReturnValue({ available: true, connected: true, paused: false, volume: 30, position: 1_000, queue: [] }) };
  const value = { customId, client: { music: service, auditLogger: { musicInteraction } }, guild: { id: "guild" }, channelId: "requests", user: { id: "user" },
    isButton: () => !modal, isModalSubmit: () => modal, deferred: true,
    deferReply: vi.fn(), deferUpdate: vi.fn(), editReply: vi.fn(), reply: vi.fn(), showModal: vi.fn(),
    fields: { getTextInputValue: () => "Song" } };
  return { value: value as unknown as ButtonInteraction | ModalSubmitInteraction, service, mocks: value, musicInteraction };
}

it("allows queue viewing without voice membership", async () => {
  const { value, service, mocks } = interaction("music:queue");
  await handleMusicInteraction(value);
  expect(service.authorize).toHaveBeenCalledWith(value.guild, "requests", "user", false);
  expect(mocks.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: "Queue", allowedMentions: { parse: [] } }));
});

it.each(["music-edit:request", "music-confirm:stop"])("rechecks membership on %s before changing playback", async (id) => {
  const { value, service } = interaction(id, id.startsWith("music-edit"));
  service.authorize.mockRejectedValue(new Error("left voice"));
  await handleMusicInteraction(value);
  expect(service.action).not.toHaveBeenCalled();
  expect(service.request).not.toHaveBeenCalled();
});

it("asks before clearing and removes the confirmation controls after completion", async () => {
  const first = interaction("music:clear");
  await handleMusicInteraction(first.value);
  expect(first.service.action).not.toHaveBeenCalled();
  expect(first.service.requireOwnerRole).toHaveBeenCalledWith(first.value.guild, "user");
  expect(first.mocks.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: expect.any(Array) }));
  const confirm = interaction("music-confirm:clear");
  await handleMusicInteraction(confirm.value);
  expect(confirm.service.action).toHaveBeenCalledWith(confirm.value.guild, "requests", "user", "clear");
  expect(confirm.mocks.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
});

it("allows lyrics viewing without voice membership or playback ownership", async () => {
  const { value, service, mocks } = interaction("music:lyrics");
  await handleMusicInteraction(value);
  expect(service.authorize).toHaveBeenCalledWith(value.guild, "requests", "user", false);
  expect(service.requireRequester).not.toHaveBeenCalled();
  expect(service.action).not.toHaveBeenCalled();
  expect(mocks.editReply).toHaveBeenCalledWith({ content: "Lyrics link", components: [] });
});

it("keeps the public music panel within component and display-text limits", () => {
  const components = musicPanel("voice").components[0].toJSON().components;
  const text = components.filter((component) => component.type === ComponentType.TextDisplay)
    .map((component) => component.content).join("");
  expect(components).toHaveLength(12);
  expect(text.length).toBeLessThanOrEqual(4_000);
});

it.each(["music:request", "music:volume"])("opens %s modal before performing member lookups", async (customId) => {
  const { value, service, mocks } = interaction(customId);
  await handleMusicInteraction(value);
  expect(mocks.showModal).toHaveBeenCalledOnce();
  expect(service.authorize).not.toHaveBeenCalled();
});

it("keeps a submitted song interaction deferred while music becomes ready", async () => {
  const { value, service, mocks } = interaction("music-edit:request", true);
  let release!: () => void;
  service.waitUntilReady.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
  const response = handleMusicInteraction(value);
  await vi.waitFor(() => expect(service.waitUntilReady).toHaveBeenCalledOnce());
  expect(mocks.deferReply).toHaveBeenCalledOnce();
  expect(service.request).not.toHaveBeenCalled();
  expect(mocks.editReply).not.toHaveBeenCalled();
  release();
  await response;
  expect(service.request).toHaveBeenCalledOnce();
  expect(mocks.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: "Queued" }));
});

it("does not submit a song when the readiness wait expires", async () => {
  const { value, service, mocks } = interaction("music-edit:request", true);
  service.waitUntilReady.mockRejectedValueOnce(new Error("still reconnecting"));
  await handleMusicInteraction(value);
  expect(service.request).not.toHaveBeenCalled();
  expect(mocks.editReply).toHaveBeenCalledOnce();
});

it("silently stops when Discord reports an expired interaction token", async () => {
  const { value, mocks, musicInteraction } = interaction("music:lyrics");
  mocks.deferred = false;
  mocks.deferReply.mockRejectedValue({ code: 10_062 });

  await expect(handleMusicInteraction(value)).resolves.toBeUndefined();
  expect(mocks.reply).not.toHaveBeenCalled();
  expect(mocks.editReply).not.toHaveBeenCalled();
  expect(musicInteraction).toHaveBeenCalledWith(value, "music:lyrics", expect.objectContaining({ status: "Expired" }), expect.any(Object));
});

it("audits the submitted song query and successful result after processing", async () => {
  const { value, musicInteraction, service } = interaction("music-edit:request", true);

  await handleMusicInteraction(value);

  expect(musicInteraction).toHaveBeenCalledWith(value, "music-edit:request", {
    action: "Submit song request",
    status: "Succeeded",
    input: "Song",
    outcome: "Queued",
  }, service.auditSnapshot.mock.results[0]?.value);
});

it("updates the private lyrics page and awaits lookup completion", async () => {
  const { value, service, mocks } = interaction("music:lyrics:request:1");
  service.lyricsMessage.mockResolvedValue({ content: "Page two", components: [] });
  await handleMusicInteraction(value);
  expect(mocks.deferUpdate).toHaveBeenCalledOnce();
  expect(service.lyricsMessage).toHaveBeenCalledWith("request", 1);
  expect(mocks.editReply).toHaveBeenCalledWith({ content: "Page two", components: [] });
  expect(isKnownComponentInteraction({ customId: "music:lyrics:request:1", isButton: () => true } as unknown as Interaction)).toBe(true);
});
