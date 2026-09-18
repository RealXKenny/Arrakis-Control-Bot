import { expect, it } from "vitest";
import { LoadType } from "shoukaku";
import { loadMusicConfig } from "../../../src/infrastructure/config/music";
import { loadedTracks, musicQuery } from "../../../src/modules/music/musicTracks";

const env = { DATABASE_URL: "postgres://test", LAVALINK_URL: "https://audio.example.com:2333", LAVALINK_PASSWORD: "test", MUSIC_GUILD_ID: "123456789012345678", MUSIC_VOICE_CHANNEL_ID: "223456789012345678", MUSIC_REQUEST_CHANNEL_ID: "323456789012345678" };
it("disables music without a URL and validates complete configuration", () => {
  expect(loadMusicConfig({})).toBeUndefined();
  expect(() => loadMusicConfig({ ...env, DATABASE_URL: "" })).toThrow("DATABASE_URL");
  expect(loadMusicConfig(env)).toMatchObject({ secure: true, url: "audio.example.com:2333", volume: 30, maxQueue: 100 });
  expect(() => loadMusicConfig({ ...env, LAVALINK_PASSWORD: "" })).toThrow("PASSWORD");
  expect(() => loadMusicConfig({ ...env, MUSIC_REQUEST_CHANNEL_ID: "" })).toThrow("CHANNEL_ID");
  expect(() => loadMusicConfig({ ...env, LAVALINK_URL: "https://user:pass@audio.example.com" })).toThrow("without credentials");
  expect(() => loadMusicConfig({ ...env, MUSIC_VOLUME: "101" })).toThrow("VOLUME");
  expect(() => loadMusicConfig({ ...env, MUSIC_MAX_QUEUE: "0" })).toThrow("MAX_QUEUE");
  expect(() => loadMusicConfig({ ...env, VOICE_JOIN_CHANNEL_ID: env.MUSIC_VOICE_CHANNEL_ID })).toThrow("separate");
});
it("accepts supported links and rejects arbitrary network targets", () => {
  expect(musicQuery("a song", "scsearch")).toBe("scsearch:a song");
  expect(musicQuery("https://youtu.be/example", "ytsearch")).toBe("https://youtu.be/example");
  for (const link of ["http://127.0.0.1:8080", "https://evil.example.com", "https://youtube.com.evil.example.com", "https://user:pass@youtube.com/a"]) {
    expect(() => musicQuery(link, "scsearch")).toThrow("HTTPS");
  }
});
it("handles empty and failed source results without exposing their details", () => {
  expect(() => loadedTracks({ loadType: LoadType.EMPTY, data: {} })).toThrow("No matching");
  expect(() => loadedTracks({ loadType: LoadType.ERROR, data: { message: "secret", severity: "common", cause: "secret" } })).toThrow("couldn't load");
});
