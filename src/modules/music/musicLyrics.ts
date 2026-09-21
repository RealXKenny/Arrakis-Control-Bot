import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from "discord.js";
import type { Track } from "shoukaku";
import { createDuneBanner } from "../../shared/discord/imageFactory";

const LRCLIB_API = "https://lrclib.net/api";
const CACHE_TTL_MS = 15 * 60_000;
const SEARCH_DELAY_MS = 250;
const USER_AGENT = "Arrakis-Control-Bot (https://github.com/RealXKenny/Arrakis-Control-Bot)";

type Lyrics = {
  text?: string;
  instrumental?: boolean;
  unavailable?: boolean;
  match?: { track: string; artist: string };
};

interface LyricsRecord {
  track: string;
  artist: string;
  duration?: number;
  text?: string;
  instrumental: boolean;
}

interface TrackMetadata {
  title: string;
  artist: string;
  duration?: number;
}

export class MusicLyrics {
  private readonly cache = new Map<string, { expires: number; result: Promise<Lyrics> }>();

  public constructor(private readonly pause: (milliseconds: number) => Promise<void> = wait) {}

  public async message(track: Track, requestId: string, page = 0) {
    // Dev note: Lyrics share a chorus in cache but never cut into the playback queue.
    const metadata = trackMetadata(track);
    const cacheKey = `${metadata.artist.toLocaleLowerCase()}\u0000${metadata.title.toLocaleLowerCase()}\u0000${metadata.duration ?? "stream"}`;
    let cached = this.cache.get(cacheKey);
    if (!cached || cached.expires <= Date.now()) {
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      cached = { expires: Date.now() + CACHE_TTL_MS, result: this.lookup(metadata) };
      this.cache.set(cacheKey, cached);
    }

    const lyrics = await cached.result;
    const geniusSearch = new URL("https://genius.com/search");
    geniusSearch.searchParams.set("q", `${metadata.title} ${metadata.artist}`.slice(0, 400));
    const lrclibSearch = new URL(`https://lrclib.net/search/${encodeURIComponent(`${metadata.title} ${metadata.artist}`.slice(0, 400))}`);
    const pages = lyricPages(lyrics.text ?? (lyrics.instrumental ? "This track is marked as instrumental."
      : lyrics.unavailable ? "Lyrics are temporarily unavailable. Try again shortly, or use one of the searches below."
      : "No confident lyrics match was found for this recording. Try one of the searches below."));
    const index = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages.length - 1)) : 0;
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (pages.length > 1) row.addComponents(
      new ButtonBuilder().setCustomId(`music:lyrics:${requestId}:${Math.max(0, index - 1)}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId(`music:lyrics:${requestId}:${Math.min(pages.length - 1, index + 1)}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(index === pages.length - 1));
    row.addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Search LRCLIB").setURL(lrclibSearch.href),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Search Genius").setURL(geniusSearch.href),
    );

    const source = lyrics.match ? `LRCLIB · ${lyrics.match.artist} — ${lyrics.match.track}` : metadata.artist;
    return {
      content: "",
      embeds: [new EmbedBuilder()
        .setColor(0xc58b45)
        .setTitle(`Lyrics · ${metadata.title}`.slice(0, 256))
        .setDescription(pages[index])
        .setImage("attachment://music-lyrics.png")
        .setFooter({ text: `${source.slice(0, 1_900)} · Page ${index + 1}/${pages.length}` })],
      files: [createDuneBanner({ artwork: "music", filename: "music-lyrics.png", title: "Lyrics Archive", subtitle: "MUSIC LOUNGE", detail: "WORDS CARRIED ACROSS THE SANDS" })],
      components: [row],
      allowedMentions: { parse: [] as never[] },
    };
  }

  private async lookup(metadata: TrackMetadata): Promise<Lyrics> {
    const exactUrl = new URL(`${LRCLIB_API}/get`);
    exactUrl.searchParams.set("track_name", metadata.title.slice(0, 300));
    exactUrl.searchParams.set("artist_name", metadata.artist.slice(0, 300));
    if (metadata.duration) exactUrl.searchParams.set("duration", String(metadata.duration));

    const exact = await requestJson(exactUrl);
    if (exact.kind === "unavailable") return { unavailable: true };
    if (exact.kind === "hit") {
      const record = parseRecord(exact.body);
      if (record) return recordLyrics(record);
    }

    const queries = searchQueries(metadata.title);
    for (let index = 0; index < queries.length; index++) {
      await this.pause(SEARCH_DELAY_MS);
      const query = queries[index]!;
      const searchUrl = new URL(`${LRCLIB_API}/search`);
      searchUrl.searchParams.set("q", query.slice(0, 300));
      const response = await requestJson(searchUrl);
      if (response.kind === "unavailable") return { unavailable: true };
      if (response.kind === "miss" || !Array.isArray(response.body)) continue;
      const records = response.body.slice(0, 20).map(parseRecord).filter((record) => record !== null);
      const best = bestLyricsMatch(records, metadata, query);
      if (best) return recordLyrics(best);
    }
    return {};
  }
}

async function requestJson(url: URL): Promise<{ kind: "hit"; body: unknown } | { kind: "miss" } | { kind: "unavailable" }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 404) return { kind: "miss" };
    if (!response.ok) return { kind: "unavailable" };
    return { kind: "hit", body: await response.json() as unknown };
  } catch {
    return { kind: "unavailable" };
  }
}

function trackMetadata(track: Track): TrackMetadata {
  const artist = track.info.author.replace(/\s*-\s*Topic$/i, "").trim() || "Unknown Artist";
  let title = track.info.title.replace(/\s*[([](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visuali[sz]er)[^\])]*[\])]/gi, "").trim();
  const prefix = `${artist} - `;
  if (title.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) title = title.slice(prefix.length).trim();
  const seconds = Math.round(track.info.length / 1_000);
  return {
    title: title.slice(0, 300) || track.info.title.slice(0, 300),
    artist: artist.slice(0, 300),
    duration: !track.info.isStream && seconds >= 1 && seconds <= 3_600 ? seconds : undefined,
  };
}

function parseRecord(value: unknown): LyricsRecord | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const track = typeof data.trackName === "string" ? data.trackName.trim() : typeof data.name === "string" ? data.name.trim() : "";
  const artist = typeof data.artistName === "string" ? data.artistName.trim() : "";
  if (!track || !artist) return null;
  const plain = typeof data.plainLyrics === "string" && data.plainLyrics.trim() ? data.plainLyrics.trim() : undefined;
  const synced = typeof data.syncedLyrics === "string" && data.syncedLyrics.trim()
    ? data.syncedLyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim()
    : undefined;
  const text = plain ?? synced;
  if (text && text.length > 100_000) return null;
  const duration = typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration : undefined;
  return { track, artist, duration, text, instrumental: data.instrumental === true };
}

function recordLyrics(record: LyricsRecord): Lyrics {
  return {
    text: record.text,
    instrumental: record.instrumental,
    match: { track: record.track.slice(0, 300), artist: record.artist.slice(0, 300) },
  };
}

function searchQueries(title: string): string[] {
  const queries = [title];
  const sections = title.split(/\s+(?:x|vs\.?|mashup)\s+|\s*[|/]\s*/i).map((section) => section.trim()).filter(Boolean);
  if (sections.length > 1) queries.push(...sections);
  const words = title.match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length >= 5) queries.push(words.slice(-2).join(" "));
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length >= 2))].slice(0, 3);
}

function bestLyricsMatch(records: readonly LyricsRecord[], metadata: TrackMetadata, query: string): LyricsRecord | null {
  let winner: { record: LyricsRecord; score: number } | undefined;
  for (const record of records) {
    if (!record.text && !record.instrumental) continue;
    const titleScore = tokenSimilarity(metadata.title, record.track) * 6;
    const queryScore = tokenSimilarity(query, record.track) * 3;
    const artistScore = tokenSimilarity(metadata.artist, record.artist) * 2;
    const durationDifference = metadata.duration && record.duration !== undefined ? Math.abs(metadata.duration - record.duration) : undefined;
    const durationScore = durationDifference === undefined ? 0 : durationDifference <= 3 ? 4 : durationDifference <= 10 ? 2 : durationDifference <= 30 ? 1 : 0;
    const score = titleScore + queryScore + artistScore + durationScore;
    if (!winner || score > winner.score) winner = { record, score };
  }
  return winner && winner.score >= 4.5 ? winner.record : null;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const matches = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return matches / new Set([...leftTokens, ...rightTokens]).size;
}

function tokens(value: string): Set<string> {
  return new Set(value.normalize("NFKD").toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function lyricPages(text: string): string[] {
  const remaining = escapeMarkdown(text);
  const pages: string[] = [];
  for (let offset = 0; offset < remaining.length;) {
    let end = Math.min(offset + 3_500, remaining.length);
    if (end < remaining.length) {
      const newline = remaining.lastIndexOf("\n", end);
      if (newline > offset) end = newline + 1;
    }
    pages.push(remaining.slice(offset, end));
    offset = end;
  }
  return pages.length ? pages : ["No lyrics available."];
}
