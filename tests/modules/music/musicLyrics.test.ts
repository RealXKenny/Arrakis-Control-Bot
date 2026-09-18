import { afterEach, expect, it, vi } from "vitest";
import type { Track } from "shoukaku";
import { MusicLyrics, lyricPages } from "../../../src/modules/music/musicLyrics";

const song = { info: { title: "Example Artist - Example Song (Official Music Video)", author: "Example Artist - Topic", length: 180_000 } } as Track;
afterEach(() => vi.unstubAllGlobals());
it("shows lyrics in pages and coalesces concurrent lookups", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ plainLyrics: "Example line for a test.\n".repeat(250) }) });
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
  expect(first.allowedMentions).toEqual({ parse: [] });
});
it.each([404, 429, 503])("handles lookup HTTP %s without exposing errors", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
  const result = await new MusicLyrics().message(song, "request");
  expect(result.embeds[0].toJSON().description).toContain(status === 404 ? "No matching lyrics" : "temporarily unavailable");
  expect(result.components[0].toJSON().components).toHaveLength(1);
});
it("handles network failures and instrumentals", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private error")));
  expect((await new MusicLyrics().message(song, "request")).embeds[0].toJSON().description).not.toContain("private error");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ instrumental: true }) }));
  expect((await new MusicLyrics().message(song, "request")).embeds[0].toJSON().description).toContain("instrumental");
});
it("preserves all text while keeping every page below Discord limits", () => {
  const text = "Sample text\n".repeat(2000);
  const pages = lyricPages(text);
  expect(pages.join("")).toBe(text);
  expect(pages.every(page => page.length <= 3500)).toBe(true);
});
