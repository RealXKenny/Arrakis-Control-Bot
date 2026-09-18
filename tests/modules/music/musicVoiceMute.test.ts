import { Collection, type Client, type VoiceState } from "discord.js";
import { afterEach, expect, it, vi } from "vitest";
import { MusicVoiceMute } from "../../../src/modules/music/MusicVoiceMute";

const services: MusicVoiceMute[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.stop(); });
async function setup(saved: string[] = []) {
  const storage = { initialize: vi.fn(), list: vi.fn().mockResolvedValue(saved), add: vi.fn(), remove: vi.fn() };
  const member = { user: { bot: false } };
  const permission = vi.fn().mockReturnValue(true);
  const voice = { id: "user", channelId: "music" as string | null, serverMute: false, member,
    channel: { permissionsFor: () => ({ has: permission }) }, setMute: vi.fn() };
  voice.setMute.mockImplementation((muted: boolean) => { voice.serverMute = muted; return Promise.resolve(member); });
  const guild = { id: "guild", available: true, members: { me: {} }, voiceStates: { cache: new Collection([["user", voice]]) } };
  const client = { guilds: { cache: new Collection([["guild", guild]]) }, logger: { warn: vi.fn() } };
  const service = new MusicVoiceMute(client as unknown as Client, "guild", "music", storage);
  services.push(service);
  await service.initialize();
  const move = async (from: string | null, to: string | null) => {
    voice.channelId = to;
    await service.onVoiceState({ channelId: from } as VoiceState, { id: "user", guild, channelId: to } as unknown as VoiceState);
  };
  return { service, storage, voice, member, permission, move };
}

it("records ownership before muting and restores it when moving to another channel", async () => {
  const { storage, voice, move } = await setup();
  await move(null, "music");
  expect(storage.add).toHaveBeenCalledWith("guild", "user");
  expect(storage.add.mock.invocationCallOrder[0]).toBeLessThan(voice.setMute.mock.invocationCallOrder[0]);
  expect(voice.serverMute).toBe(true);
  await move("music", "other");
  expect(voice.serverMute).toBe(false);
  expect(storage.remove).toHaveBeenCalledWith("guild", "user");
});

it("never takes ownership of or clears an existing server mute", async () => {
  const { voice, storage, move } = await setup();
  voice.serverMute = true;
  await move(null, "music");
  await move("music", "other");
  expect(storage.add).not.toHaveBeenCalled();
  expect(voice.setMute).not.toHaveBeenCalled();
});

it("defers an unmute while disconnected and restores it on the next connection", async () => {
  const { voice, storage, move } = await setup();
  await move(null, "music");
  await move("music", null);
  expect(storage.remove).not.toHaveBeenCalled();
  expect(voice.setMute).toHaveBeenCalledTimes(1);
  await move(null, "other");
  expect(voice.serverMute).toBe(false);
});

it("recovers a persisted mute after a restart", async () => {
  const { service, voice, storage } = await setup(["user"]);
  voice.channelId = "other"; voice.serverMute = true;
  service.start();
  await vi.waitFor(() => expect(storage.remove).toHaveBeenCalledWith("guild", "user"));
  expect(voice.serverMute).toBe(false);
});

it("excludes bots and refuses to mute if ownership cannot be saved", async () => {
  const { member, voice, storage, move } = await setup();
  member.user.bot = true;
  await move(null, "music");
  expect(voice.setMute).not.toHaveBeenCalled();
  member.user.bot = false;
  storage.add.mockRejectedValueOnce(new Error("database down"));
  await move(null, "music");
  expect(voice.setMute).not.toHaveBeenCalled();
});

it("retains pending cleanup when an unmute fails", async () => {
  const { voice, storage, move } = await setup(["user"]);
  voice.serverMute = true;
  voice.setMute.mockRejectedValueOnce(new Error("missing permission"));
  await move("music", "other");
  expect(storage.remove).not.toHaveBeenCalled();
  await move("other", "another");
  expect(storage.remove).toHaveBeenCalled();
});
