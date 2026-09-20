import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from "discord.js";
import type { Track } from "shoukaku";

type Lyrics = { text?: string; instrumental?: boolean; unavailable?: boolean };

export class MusicLyrics {
  private readonly cache = new Map<string, { expires: number; result: Promise<Lyrics> }>();

  public async message(track: Track, requestId: string, page = 0) {
    // Dev note: Lyrics share a chorus in cache but never cut into the playback queue.
    const artist = track.info.author.replace(/\s*-\s*Topic$/i, "").trim();
    let title = track.info.title.replace(/\s*[([](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visuali[sz]er)[^\])]*[\])]/gi, "").trim();
    const prefix = `${artist} - `;
    if (title.toLowerCase().startsWith(prefix.toLowerCase())) title = title.slice(prefix.length).trim();
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.set("track_name", title.slice(0, 300));
    url.searchParams.set("artist_name", artist.slice(0, 300));
    const seconds = Math.round(track.info.length / 1000);
    if (!track.info.isStream && seconds >= 1 && seconds <= 3600) url.searchParams.set("duration", String(seconds));
    let cached = this.cache.get(url.href);
    if (!cached || cached.expires <= Date.now()) {
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      cached = { expires: Date.now() + 60_000, result: this.fetch(url) };
      this.cache.set(url.href, cached);
    }
    const lyrics = await cached.result;
    const search = new URL("https://genius.com/search");
    search.searchParams.set("q", `${title} ${artist}`.slice(0, 400));
    const pages = lyricPages(lyrics.text ?? (lyrics.instrumental ? "This track is marked as instrumental."
      : lyrics.unavailable ? "Lyrics are temporarily unavailable. Try again shortly, or search Genius below."
      : "No matching lyrics were found for this recording. You can search Genius below."));
    const index = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages.length - 1)) : 0;
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (pages.length > 1) row.addComponents(
      new ButtonBuilder().setCustomId(`music:lyrics:${requestId}:${Math.max(0, index - 1)}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId(`music:lyrics:${requestId}:${Math.min(pages.length - 1, index + 1)}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(index === pages.length - 1));
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Search Genius").setURL(search.href));
    return { content: "", embeds: [new EmbedBuilder().setColor(0xc58b45).setTitle(`Lyrics · ${title}`.slice(0, 256))
      .setDescription(pages[index]).setFooter({ text: `${artist.slice(0, 200)} · ${lyrics.text || lyrics.instrumental ? "LRCLIB · " : ""}Page ${index + 1}/${pages.length}` })],
      components: [row], allowedMentions: { parse: [] as never[] } };
  }

  private async fetch(url: URL): Promise<Lyrics> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000), redirect: "error", headers: { "User-Agent": "Arrakis-Control-Bot (https://github.com/RealXKenny/Arrakis-Control-Bot)", Accept: "application/json" } });
      if (response.status === 404) return {};
      if (!response.ok) return { unavailable: true };
      const body: unknown = await response.json();
      if (!body || typeof body !== "object") return { unavailable: true };
      const data = body as Record<string, unknown>;
      const text = typeof data.plainLyrics === "string" && data.plainLyrics.trim() ? data.plainLyrics
        : typeof data.syncedLyrics === "string" ? data.syncedLyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "") : undefined;
      if (text && text.length > 100_000) return { unavailable: true };
      return { text: text?.trim(), instrumental: data.instrumental === true };
    } catch { return { unavailable: true }; }
  }
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
