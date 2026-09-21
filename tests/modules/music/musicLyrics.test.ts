import { afterEach, expect, it, vi } from "vitest";
import type { Track } from "shoukaku";
import { MusicLyrics, lyricPages } from "../../../src/modules/music/musicLyrics";

const song = { info: { title: "Example Artist - Example Song (Official Music Video)", author: "Example Artist - Topic", length: 180_000 } } as Track;
afterEach(() => vi.unstubAllGlobals());
it("shows lyrics in pages and coalesces concurrent lookups", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({
    trackName: "Example Song", artistName: "Example Artist", duration: 180, plainLyrics: "Example line for a test.\n".repeat(250),
  }) });
  vi.stubGlobal("fetch", fetch);
  const lyrics = new MusicLyrics();
  const [first, second] = await Promise.all([lyrics.message(song, "request", 0), lyrics.message(song, "request", 1)]);
  expect(fetch).toHaveBeenCalledTimes(1);
  const url = fetch.mock.calls[0][0] as URL;
  expect(url.searchParams.get("track_name")).toBe("Example Song");
  expect(url.searchParams.get("artist_name")).toBe("Example Artist");
  expect(url.searchParams.get("duration")).toBe("180");
  expect(first.embeds[0].toJSON().description).toContain("Example line");
  expect(second.embeds[0].toJSON().footer?.text).toContain("Page 2/2");
  expect(first.components[0].toJSON().components[1]).toMatchObject({ custom_id: "music:lyrics:request:1" });
  expect(first.embeds[0].toJSON().footer?.text).toContain("LRCLIB · Example Artist — Example Song");
  expect(first.allowedMentions).toEqual({ parse: [] });
});
it.each([404, 429, 503])("handles lookup HTTP %s without exposing errors", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
  const result = await new MusicLyrics(() => Promise.resolve()).message(song, "request");
  expect(result.embeds[0].toJSON().description).toContain(status === 404 ? "No confident lyrics match" : "temporarily unavailable");
  expect(result.components[0].toJSON().components).toHaveLength(2);
});
it("handles network failures and instrumentals", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private error")));
  expect((await new MusicLyrics().message(song, "request")).embeds[0].toJSON().description).not.toContain("private error");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({
    trackName: "Example Song", artistName: "Example Artist", duration: 180, instrumental: true,
  }) }));
  expect((await new MusicLyrics().message(song, "request")).embeds[0].toJSON().description).toContain("instrumental");
});
it("falls back to a scored title fragment search for remix metadata", async () => {
  const remix = { info: { title: "TOO COOL TO BE BILLIE JEAN", author: "theo", length: 192_000, isStream: false } } as Track;
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([
      { trackName: "Billie Jean", artistName: "Michael Jackson", duration: 287, plainLyrics: "Original recording lyrics" },
      { trackName: "Billie Jean", artistName: "TWOPILOTS", duration: 192, plainLyrics: "Matched cover lyrics" },
    ]) });
  vi.stubGlobal("fetch", fetch);
  const pause = vi.fn().mockResolvedValue(undefined);

  const result = await new MusicLyrics(pause).message(remix, "request");

  expect(fetch).toHaveBeenCalledTimes(3);
  expect((fetch.mock.calls[1][0] as URL).searchParams.get("q")).toBe("TOO COOL TO BE BILLIE JEAN");
  expect((fetch.mock.calls[2][0] as URL).searchParams.get("q")).toBe("BILLIE JEAN");
  expect(pause).toHaveBeenCalledTimes(2);
  expect(result.embeds[0].toJSON().description).toContain("Matched cover lyrics");
  expect(result.embeds[0].toJSON().footer?.text).toContain("LRCLIB · TWOPILOTS — Billie Jean");
});
it("preserves all text while keeping every page below Discord limits", () => {
  const text = "Sample text\n".repeat(2000);
  const pages = lyricPages(text);
  expect(pages.join("")).toBe(text);
  expect(pages.every(page => page.length <= 3500)).toBe(true);
});
