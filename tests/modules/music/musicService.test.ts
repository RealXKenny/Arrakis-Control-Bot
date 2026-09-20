import { Collection, ChannelType, type Client, type Guild, type Message } from "discord.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LoadType, type Track } from "shoukaku";
import type { MusicConfig } from "../../../src/infrastructure/config/music";
import type { MusicEvents } from "../../../src/infrastructure/audio/LavalinkConnection";
import { MusicService } from "../../../src/modules/music/MusicService";
import type { MusicState } from "../../../src/infrastructure/database/music/MusicRepository";

const mocked = vi.hoisted(() => ({ events: undefined as MusicEvents | undefined, connected: false, available: true,
  resolve: vi.fn(), join: vi.fn(), leave: vi.fn(), close: vi.fn(), freezePosition: vi.fn(),
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
  freezePosition = mocked.freezePosition;
} }));

const config: MusicConfig = { guildId: "guild", voiceChannelId: "voice", requestChannelId: "requests", url: "localhost:2333", password: "test", secure: false, searchPrefix: "scsearch", volume: 30, maxQueue: 3 };
const services: MusicService[] = [];
function track(title = "Song"): Track {
  return { encoded: title, info: { title, author: "Artist", identifier: title, isSeekable: true, isStream: false, length: 1000, position: 0, sourceName: "soundcloud" }, pluginInfo: {} };
}
function setup(saved?: MusicState) {
  const user = { voice: { channelId: "voice" }, roles: { cache: new Collection([["owner-role", {}]]) } };
  const me = { voice: { channelId: "voice" } };
  const guild = { id: "guild", available: true, shardId: 0, members: { fetch: vi.fn().mockResolvedValue(user), fetchMe: vi.fn().mockResolvedValue(me) },
    channels: { fetch: vi.fn().mockResolvedValue({ id: "voice", type: ChannelType.GuildVoice, permissionsFor: () => ({ has: () => true }) }) } };
  const edit = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue({ edit });
  const dm = vi.fn().mockResolvedValue(undefined);
  const client = { users: { fetch: vi.fn().mockResolvedValue({ send: dm }) }, channels: { fetch: vi.fn().mockResolvedValue({ isSendable: () => true, isDMBased: () => false, guildId: "guild", messages: { fetch: vi.fn().mockResolvedValue(new Collection()) }, send }) },
    guilds: { cache: new Collection([["guild", guild]]) }, logger: { warn: vi.fn() }, interactionRateLimiter: { allow: () => true } };
  const storage = { initialize: vi.fn().mockResolvedValue(undefined), load: vi.fn().mockResolvedValue(saved), save: vi.fn().mockResolvedValue(undefined) };
  const service = new MusicService(client as unknown as Client, config, storage);
  services.push(service);
  return { service, guild: guild as unknown as Guild, user, me, client, storage, send, edit, dm };
}
function requestId(index: number): string { return mocked.player.playTrack.mock.calls[index][0].track.userData.requestId; }

beforeEach(() => {
  vi.stubEnv("OWNER_ROLE_ID", "owner-role");
  vi.clearAllMocks(); mocked.connected = false; mocked.available = true;
  mocked.freezePosition.mockResolvedValue(undefined);
  mocked.resolve.mockResolvedValue({ loadType: LoadType.SEARCH, data: [track()] });
  mocked.join.mockImplementation(() => { mocked.connected = true; return Promise.resolve(mocked.player); });
  mocked.leave.mockImplementation(() => { mocked.connected = false; return Promise.resolve(); });
  mocked.player.track = null; mocked.player.position = 0;
  mocked.player.playTrack.mockImplementation((options) => { mocked.player.track = options.track.encoded; mocked.player.position = options.position ?? 0; return Promise.resolve(); });
});
afterEach(async () => { for (const service of services.splice(0)) await service.stop(); vi.unstubAllEnvs(); });

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
  const { service, guild, client } = setup();
  mocked.player.playTrack.mockRejectedValueOnce(new Error("secret credential"));
  await expect(service.request(guild, "requests", "user", "song")).resolves.toContain("queued, but playback is reconnecting");
  expect(service.describeQueue()).toContain("Song");
  expect(service.errorMessage(new Error("secret credential"))).not.toContain("secret credential");
  expect(client.logger.warn).not.toHaveBeenCalled();
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

it.each(["skip", "pause", "resume", "volume"] as const)("restricts %s to the current requester while others can queue", async (action) => {
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

it("keeps a single card across track changes and suppresses duplicate start events", async () => {
  const { service, guild, send, edit } = setup();
  const song = track("Same song"); song.info.artworkUrl = "https://example.com/cover.jpg";
  mocked.resolve.mockResolvedValue({ loadType: LoadType.SEARCH, data: [song] });
  await service.request(guild, "requests", "user", "one");
  await service.request(guild, "requests", "other", "two");
  expect(send).not.toHaveBeenCalled();
  mocked.events!.started(requestId(0));
  mocked.events!.started(requestId(0));
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(send.mock.calls[0][0].embeds[0].toJSON()).toMatchObject({ image: { url: song.info.artworkUrl }, fields: [{ name: "Requested by", value: "<@user>" }] });
  expect(send.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
  await service.action(guild, "requests", "user", "skip");
  mocked.events!.started(requestId(0)); // Late event for the old track.
  mocked.events!.started(requestId(1));
  await vi.waitFor(() => expect(edit).toHaveBeenCalled());
  expect(send).toHaveBeenCalledTimes(1);
  expect(edit.mock.lastCall![0].embeds[0].toJSON().fields).toEqual([{ name: "Requested by", value: "<@other>" }]);
});

it("continues playback and future announcements after a Discord send failure", async () => {
  const { service, guild, send, client } = setup();
  send.mockRejectedValueOnce(new Error("missing permission"));
  await service.request(guild, "requests", "user", "one");
  mocked.events!.started(requestId(0));
  await vi.waitFor(() => expect(client.logger.warn).toHaveBeenCalled());
  await service.request(guild, "requests", "user", "two");
  await service.action(guild, "requests", "user", "skip");
  mocked.events!.started(requestId(1));
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
});

it("cleans processed requests and acknowledgments after 15 seconds", async () => {
  vi.useFakeTimers();
  try {
    const { service, guild } = setup();
    const deleteRequest = vi.fn().mockResolvedValue(undefined);
    const deleteReply = vi.fn().mockResolvedValue(undefined);
    await service.onMessage({ guild, guildId: "guild", channelId: "requests", author: { id: "user", bot: false }, content: "song",
      reply: vi.fn().mockResolvedValue({ delete: deleteReply }), delete: deleteRequest } as unknown as Message);
    expect(deleteRequest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(deleteRequest).toHaveBeenCalledOnce();
    expect(deleteReply).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it("DMs only the current requester on track start, with artwork and a lounge link", async () => {
  const { service, guild, client, dm } = setup();
  const song = track(); song.info.artworkUrl = "https://example.com/art.jpg";
  mocked.resolve.mockResolvedValue({ loadType: LoadType.SEARCH, data: [song] });
  await service.request(guild, "requests", "requester", "song");
  expect(dm).not.toHaveBeenCalled();
  mocked.events!.started(requestId(0));
  mocked.events!.started(requestId(0));
  await vi.waitFor(() => expect(dm).toHaveBeenCalledOnce());
  expect(client.users.fetch).toHaveBeenCalledWith("requester");
  const payload = dm.mock.calls[0][0];
  expect(payload.embeds[0].toJSON()).toMatchObject({ title: "🎵 Your song is playing", image: { url: song.info.artworkUrl } });
  expect(payload.components[0].toJSON().components[0].url).toBe("https://discord.com/channels/guild/requests");
});

it("continues playback and updates the public card when the requester blocks DMs", async () => {
  const { service, guild, dm, send } = setup();
  dm.mockRejectedValue({ code: 50007 });
  await service.request(guild, "requests", "user", "song");
  mocked.events!.started(requestId(0));
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(mocked.player.stopTrack).not.toHaveBeenCalled();
  await service.action(guild, "requests", "user", "pause");
  expect(mocked.player.setPaused).toHaveBeenCalledWith(true);
});

it("resumes a rebooted song at the frozen shutdown offset without consuming downtime", async () => {
  const first = setup();
  const song = track("long song"); song.info.length = 240_000;
  mocked.resolve.mockResolvedValueOnce({ loadType: LoadType.SEARCH, data: [song] });
  await first.service.request(first.guild, "requests", "user", "song");
  mocked.player.position = 100_000;
  mocked.freezePosition.mockResolvedValueOnce(123_456);
  await first.service.stop();
  const saved = structuredClone(first.storage.save.mock.lastCall![1]) as MusicState;
  expect(saved.position).toBe(123_456);
  expect(saved.paused).toBe(false);
  mocked.connected = false;
  const restarted = setup(saved);
  await restarted.service.initialize();
  restarted.service.start();
  await vi.waitFor(() => expect(mocked.player.playTrack).toHaveBeenLastCalledWith(expect.objectContaining({ position: 123_456, paused: false })));
  expect(song.info.length - saved.position).toBe(116_544);
});

it("retains the cached offset if final position capture fails", async () => {
  const { service, guild, storage } = setup();
  await service.request(guild, "requests", "user", "song");
  mocked.player.position = 650;
  mocked.freezePosition.mockRejectedValueOnce(new Error("Lavalink down"));
  await service.stop();
  expect(storage.save).toHaveBeenLastCalledWith("guild", expect.objectContaining({ position: 650, paused: false }));
});

it.each(["clear", "stop"] as const)("restricts %s to the configured owner role and rechecks role changes", async (action) => {
  const { service, guild, user, storage } = setup();
  await service.request(guild, "requests", "requester", "one");
  await service.request(guild, "requests", "requester", "two");
  user.roles.cache.clear();
  const saves = storage.save.mock.calls.length;
  await expect(service.action(guild, "requests", "requester", action)).rejects.toThrow("Owner role");
  expect(storage.save).toHaveBeenCalledTimes(saves);
  user.roles.cache.set("owner-role", {});
  await service.action(guild, "requests", "different-user", action);
  expect(guild.members.fetch).toHaveBeenCalledWith({ user: "different-user", force: true });
  expect(service.describeQueue()).toContain("Waiting: 0");
  user.roles.cache.clear();
  await expect(service.action(guild, "requests", "different-user", action)).rejects.toThrow("Owner role");
});

it("denies owner controls when OWNER_ROLE_ID is missing", async () => {
  const { service, guild } = setup();
  vi.stubEnv("OWNER_ROLE_ID", "");
  await expect(service.action(guild, "requests", "user", "clear")).rejects.toThrow("OWNER_ROLE_ID");
});

it("retries a late Lavalink node every ten seconds and restores the same song position", async () => {
  vi.useFakeTimers();
  try {
    const saved: MusicState = { current: { id: "restore", requester: "user", track: track("saved") },
      queue: [{ id: "next", requester: "user", track: track("next") }], position: 450, paused: false, volume: 30 };
    const { service, storage } = setup(saved);
    await service.initialize();
    mocked.available = false;
    service.start();
    await vi.advanceTimersByTimeAsync(5_000);
    mocked.available = true;
    mocked.events!.ready();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(mocked.player.playTrack).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocked.player.playTrack).toHaveBeenCalledWith(expect.objectContaining({ position: 450, track: expect.objectContaining({ encoded: "saved" }) }));
    mocked.events!.failed("restore");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(storage.save.mock.calls.at(-1)?.[1]).toMatchObject({ current: { id: "restore" }, position: 450, queue: [{ id: "next" }] });
    expect(mocked.player.playTrack.mock.calls.every(([options]) => options.track.encoded === "saved")).toBe(true);
    mocked.events!.started("restore");
    mocked.events!.ended("restore");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocked.player.playTrack.mock.calls.at(-1)?.[0].track.encoded).toBe("next");
    await service.stop();
  } finally { vi.useRealTimers(); }
});

it("waits ten seconds after a failed recovery completes, without overlapping attempts", async () => {
  vi.useFakeTimers();
  try {
    const { service } = setup();
    let rejectJoin!: (error: Error) => void;
    mocked.join.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectJoin = reject; }));
    service.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocked.join).toHaveBeenCalledTimes(1);
    rejectJoin(new Error("not ready"));
    await vi.advanceTimersByTimeAsync(0);
    mocked.events!.ready();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocked.join).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocked.join).toHaveBeenCalledTimes(2);
    await service.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocked.join).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it.each([true, false])("preserves an already-playing song and position on interruption (identified=%s)", async (identified) => {
  vi.useFakeTimers();
  try {
    const { service, guild, storage } = setup();
    await service.request(guild, "requests", "user", "song");
    await service.request(guild, "requests", "user", "next");
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    const id = requestId(0);
    mocked.events!.started(id);
    mocked.player.position = 650;
    mocked.events!.failed(identified ? id : undefined);
    mocked.player.position = 0;
    // A late end from the broken playback must not consume the request.
    mocked.events!.ended(id);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
    expect(mocked.player.playTrack.mock.calls[1][0]).toMatchObject({ position: 650, track: { userData: { requestId: id } } });
    expect(storage.save.mock.calls.at(-1)?.[1]).toMatchObject({ current: { id }, position: 650, queue: [expect.any(Object)] });
    mocked.events!.started(id);
    mocked.events!.ended(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(requestId(2)).not.toBe(id);
    await service.stop();
  } finally { vi.useRealTimers(); }
});

it("detects silent stalls and retries the same song from its last position", async () => {
  vi.useFakeTimers();
  try {
    const { service, guild, storage } = setup();
    await service.request(guild, "requests", "user", "song");
    await service.request(guild, "requests", "other", "next");
    mocked.events!.started(requestId(0));
    mocked.player.position = 650;
    service.start();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
    expect(mocked.player.playTrack.mock.lastCall![0]).toMatchObject({ position: 650, track: { userData: { requestId: requestId(0) } } });
    expect(storage.save.mock.lastCall![1]).toMatchObject({ position: 650, queue: [expect.objectContaining({ requester: "other" })] });
    await service.stop();
  } finally { vi.useRealTimers(); }
});

it("recovers when playback is accepted but never starts", async () => {
  vi.useFakeTimers();
  try {
    const { service, guild } = setup();
    mocked.player.playTrack.mockResolvedValueOnce(undefined);
    await service.request(guild, "requests", "user", "song");
    service.start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
    expect(requestId(1)).toBe(requestId(0));
    await service.stop();
  } finally { vi.useRealTimers(); }
});

it("does not restart paused or steadily progressing songs", async () => {
  vi.useFakeTimers();
  try {
    const { service, guild } = setup();
    await service.request(guild, "requests", "user", "song");
    service.start();
    for (let step = 1; step <= 12; step++) {
      mocked.player.position = step * 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
    }
    await service.action(guild, "requests", "user", "pause");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
    await service.action(guild, "requests", "user", "resume");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
    await service.stop();
  } finally { vi.useRealTimers(); }
});

it("does not postpone recovery for duplicate failure events", async () => {
  vi.useFakeTimers();
  try {
    const { service, guild } = setup();
    await service.request(guild, "requests", "user", "song");
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    mocked.events!.failed(requestId(0));
    await vi.advanceTimersByTimeAsync(5_000);
    mocked.events!.failed(requestId(0));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocked.player.playTrack).toHaveBeenCalledTimes(2);
    await service.stop();
  } finally { vi.useRealTimers(); }
});

it("allows authorized saved-queue controls during a Lavalink outage", async () => {
  const { service, guild, storage } = setup();
  await service.request(guild, "requests", "user", "song");
  await service.request(guild, "requests", "other", "next");
  mocked.available = false;
  mocked.events!.failed(requestId(0));
  await expect(service.action(guild, "requests", "other", "skip")).rejects.toThrow("Only the person");
  await service.action(guild, "requests", "user", "skip");
  expect(storage.save.mock.lastCall![1]).toMatchObject({ current: { requester: "other" }, position: 0, queue: [] });
  expect(mocked.player.playTrack).toHaveBeenCalledTimes(1);
  await service.action(guild, "requests", "user", "clear");
  await service.action(guild, "requests", "user", "stop");
  expect(storage.save.mock.lastCall![1]).toMatchObject({ current: undefined, queue: [] });
});
