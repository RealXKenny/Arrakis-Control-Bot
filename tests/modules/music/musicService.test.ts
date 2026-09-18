import { Collection, ChannelType, type Client, type Guild } from "discord.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LoadType, type Track } from "shoukaku";
import type { MusicConfig } from "../../../src/infrastructure/config/music";
import type { MusicEvents } from "../../../src/infrastructure/audio/LavalinkConnection";
import { MusicService } from "../../../src/modules/music/MusicService";
import type { MusicState } from "../../../src/infrastructure/database/music/MusicRepository";

const mocked = vi.hoisted(() => ({ events: undefined as MusicEvents | undefined, connected: false, available: true,
  resolve: vi.fn(), join: vi.fn(), leave: vi.fn(), close: vi.fn(),
  player: { track: null as string | null, position: 0, playTrack: vi.fn(), stopTrack: vi.fn(), setPaused: vi.fn(), setGlobalVolume: vi.fn() },
}));
vi.mock("../../../src/infrastructure/audio/LavalinkConnection", () => ({ LavalinkConnection: class {
  constructor(_client: unknown, _config: unknown, events: MusicEvents) { mocked.events = events; }
  available() { return mocked.available; }
  player() { return mocked.connected ? mocked.player : undefined; }
  resolve = mocked.resolve;
  join = mocked.join;
  leave = mocked.leave;
  close = mocked.close;
} }));

const config: MusicConfig = { guildId: "guild", voiceChannelId: "voice", requestChannelId: "requests", url: "localhost:2333", password: "test", secure: false, searchPrefix: "scsearch", volume: 30, maxQueue: 3 };
const services: MusicService[] = [];
function track(title = "Song"): Track {
  return { encoded: title, info: { title, author: "Artist", identifier: title, isSeekable: true, isStream: false, length: 1000, position: 0, sourceName: "soundcloud" }, pluginInfo: {} };
}
function setup(saved?: MusicState) {
  const user = { voice: { channelId: "voice" } };
  const me = { voice: { channelId: "voice" } };
  const guild = { id: "guild", available: true, shardId: 0, members: { fetch: vi.fn().mockResolvedValue(user), fetchMe: vi.fn().mockResolvedValue(me) },
    channels: { fetch: vi.fn().mockResolvedValue({ id: "voice", type: ChannelType.GuildVoice, permissionsFor: () => ({ has: () => true }) }) } };
  const client = { guilds: { cache: new Collection([["guild", guild]]) }, logger: { warn: vi.fn() }, interactionRateLimiter: { allow: () => true } };
  const storage = { initialize: vi.fn().mockResolvedValue(undefined), load: vi.fn().mockResolvedValue(saved), save: vi.fn().mockResolvedValue(undefined) };
  const service = new MusicService(client as unknown as Client, config, storage);
  services.push(service);
  return { service, guild: guild as unknown as Guild, user, me, client, storage };
}
function requestId(index: number): string { return mocked.player.playTrack.mock.calls[index][0].track.userData.requestId; }

beforeEach(() => {
  vi.clearAllMocks(); mocked.connected = false; mocked.available = true;
  mocked.resolve.mockResolvedValue({ loadType: LoadType.SEARCH, data: [track()] });
  mocked.join.mockImplementation(() => { mocked.connected = true; return Promise.resolve(mocked.player); });
  mocked.leave.mockImplementation(() => { mocked.connected = false; return Promise.resolve(); });
  mocked.player.track = null; mocked.player.position = 0;
  mocked.player.playTrack.mockImplementation((options) => { mocked.player.track = options.track.encoded; mocked.player.position = options.position ?? 0; return Promise.resolve(); });
});
afterEach(async () => { for (const service of services.splice(0)) await service.stop(); });

it("joins the permanent channel, sets volume and plays the first search result", async () => {
  const { service, guild } = setup();
  await service.request(guild, "requests", "user", "my song");
  expect(mocked.resolve).toHaveBeenCalledWith("scsearch:my song");
  expect(mocked.join).toHaveBeenCalledWith("guild", "voice", 0);
  expect(mocked.player.setGlobalVolume).toHaveBeenCalledWith(30);
  expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
  expect(service.describeQueue()).toContain("Song");
});

it("advances once on track end and rejects delayed duplicate end events", async () => {
  const { service, guild } = setup();
  await service.request(guild, "requests", "user", "one");
  await service.request(guild, "requests", "user", "two");
  const first = requestId(0);
  mocked.events!.ended(first);
  await vi.waitFor(() => expect(mocked.player.playTrack).toHaveBeenCalledTimes(2));
  mocked.events!.ended(first);
  await service.action(guild, "requests", "user", "volume", 40);
  expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
});

it("stays connected after stop and clears the queue", async () => {
  const { service, guild } = setup();
  await service.request(guild, "requests", "user", "one");
  await service.request(guild, "requests", "user", "two");
  await service.action(guild, "requests", "user", "stop");
  expect(mocked.leave).not.toHaveBeenCalled();
  expect(service.describeQueue()).toContain("Nothing playing");
  expect(service.describeQueue()).toContain("Waiting: 0");
});

it("requires the configured request channel and voice membership before playback", async () => {
  const { service, guild, user } = setup();
  await expect(service.request(guild, "other", "user", "song")).rejects.toThrow("request channel");
  user.voice.channelId = "other";
  await expect(service.request(guild, "requests", "user", "song")).rejects.toThrow("Join the music");
  await expect(service.action(guild, "requests", "user", "skip")).rejects.toThrow("Join the music");
  expect(mocked.join).not.toHaveBeenCalled();
});

it("rejects oversized playlists atomically", async () => {
  const { service, guild } = setup();
  mocked.resolve.mockResolvedValueOnce({ loadType: LoadType.PLAYLIST, data: { tracks: [track("a"), track("b"), track("c"), track("d")] } });
  await expect(service.request(guild, "requests", "user", "playlist")).rejects.toThrow("3-song limit");
  expect(mocked.player.playTrack).not.toHaveBeenCalled();
  expect(service.describeQueue()).toContain("Waiting: 0");
});

it("recovers the current track after Lavalink reconnects", async () => {
  const { service, guild } = setup();
  await service.request(guild, "requests", "user", "song");
  service.start();
  await vi.waitFor(() => expect(mocked.join).toHaveBeenCalledTimes(1));
  mocked.events!.ready();
  // Startup recovery may still be active; another ready event is safe.
  await new Promise((resolve) => setTimeout(resolve, 10));
  mocked.events!.ready();
  await vi.waitFor(() => expect(mocked.player.playTrack.mock.calls.length).toBeGreaterThan(1));
  expect(mocked.leave).toHaveBeenCalledWith("guild");
});

it("keeps a request queued if playback fails and does not expose server errors", async () => {
  const { service, guild } = setup();
  mocked.player.playTrack.mockRejectedValueOnce(new Error("secret credential"));
  await expect(service.request(guild, "requests", "user", "song")).resolves.toContain("queued, but playback is reconnecting");
  expect(service.describeQueue()).toContain("Song");
  expect(service.errorMessage(new Error("secret credential"))).not.toContain("secret credential");
});

it("supports pause/resume, skip and bounded volume", async () => {
  const { service, guild } = setup();
  await service.request(guild, "requests", "user", "one");
  await service.request(guild, "requests", "user", "two");
  await service.action(guild, "requests", "user", "pause");
  expect(mocked.player.setPaused).toHaveBeenLastCalledWith(true);
  await service.action(guild, "requests", "user", "resume");
  expect(mocked.player.setPaused).toHaveBeenLastCalledWith(false);
  await expect(service.action(guild, "requests", "user", "volume", 101)).rejects.toThrow("Volume");
  await service.action(guild, "requests", "user", "skip");
  expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
});

it("shows current artwork and drops it after playback stops", async () => {
  const { service, guild } = setup();
  const song = track();
  song.info.artworkUrl = "https://example.com/cover.jpg";
  mocked.resolve.mockResolvedValueOnce({ loadType: LoadType.SEARCH, data: [song] });
  await service.request(guild, "requests", "user", "song");
  expect(service.nowPlayingMessage().embeds[0].toJSON().image?.url).toBe(song.info.artworkUrl);
  await service.action(guild, "requests", "user", "stop");
  expect(service.nowPlayingMessage().embeds[0].toJSON().image).toBeUndefined();
});

it("falls back to a YouTube thumbnail when artwork is missing or invalid", async () => {
  const { service, guild } = setup();
  const song = track();
  Object.assign(song.info, { sourceName: "youtube", identifier: "LDU_Txk06tM", artworkUrl: "not a URL" });
  mocked.resolve.mockResolvedValueOnce({ loadType: LoadType.SEARCH, data: [song] });
  await service.request(guild, "requests", "user", "song");
  expect(service.nowPlayingMessage().embeds[0].toJSON().image?.url).toBe("https://i.ytimg.com/vi/LDU_Txk06tM/hqdefault.jpg");
});

it.each(["skip", "pause", "resume", "volume", "clear", "stop"] as const)("restricts %s to the current requester while others can queue", async (action) => {
  const { service, guild } = setup();
  await service.request(guild, "requests", "owner", "one");
  await service.request(guild, "requests", "other", "two");
  await expect(service.action(guild, "requests", "other", action, 40)).rejects.toThrow("Only the person");
  await service.action(guild, "requests", "owner", "skip");
  await expect(service.action(guild, "requests", "owner", "pause")).rejects.toThrow("Only the person");
  await service.action(guild, "requests", "other", "pause");
});

it("restores requester ownership, queue, position, pause and volume before playing", async () => {
  const saved: MusicState = { current: { id: "old", requester: "owner", track: track("restored") },
    queue: [{ id: "next", requester: "other", track: track("next") }], position: 450, paused: true, volume: 67 };
  const { service, guild } = setup(saved);
  await service.initialize();
  await service.action(guild, "requests", "owner", "resume");
  expect(mocked.player.playTrack).toHaveBeenCalledWith(expect.objectContaining({ position: 450, paused: true }));
  expect(mocked.player.setGlobalVolume).toHaveBeenCalledWith(67);
  expect(service.describeQueue()).toContain("next");
  await expect(service.action(guild, "requests", "other", "skip")).rejects.toThrow("Only the person");
});

it("checkpoints position and saves it on graceful shutdown", async () => {
  vi.useFakeTimers();
  try {
    const { service, guild, storage } = setup();
    await service.request(guild, "requests", "user", "one");
    service.start();
    mocked.player.position = 700;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(storage.save).toHaveBeenLastCalledWith("guild", expect.objectContaining({ position: 700 }));
    mocked.player.position = 850;
    await service.stop();
    expect(storage.save).toHaveBeenLastCalledWith("guild", expect.objectContaining({ position: 850 }));
  } finally { vi.useRealTimers(); }
});

it("does not mutate the queue or skip playback if the database write fails", async () => {
  const { service, guild, storage } = setup();
  await service.request(guild, "requests", "user", "one");
  await service.request(guild, "requests", "other", "two");
  storage.save.mockRejectedValueOnce(new Error("database offline"));
  await expect(service.action(guild, "requests", "user", "skip")).rejects.toThrow("database");
  expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
  expect(service.describeQueue()).toContain("Waiting: 1");
  storage.save.mockRejectedValueOnce(new Error("database offline"));
  await expect(service.request(guild, "requests", "other", "three")).rejects.toThrow("database");
  expect(service.describeQueue()).toContain("Waiting: 1");
});

it("persists stop so a restart does not resurrect cleared songs", async () => {
  const { service, guild, storage } = setup();
  await service.request(guild, "requests", "user", "one");
  await service.action(guild, "requests", "user", "stop");
  expect(storage.save).toHaveBeenLastCalledWith("guild", expect.objectContaining({ current: undefined, queue: [], position: 0, paused: false }));
});

it("starts live streams at the live edge instead of seeking to a saved offset", async () => {
  const live = track(); live.info.isStream = true; live.info.isSeekable = false;
  const { service, guild } = setup({ current: { id: "live", requester: "user", track: live }, queue: [], position: 900, paused: false, volume: 30 });
  await service.action(guild, "requests", "user", "volume", 40);
  expect(mocked.player.playTrack).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }));
});
