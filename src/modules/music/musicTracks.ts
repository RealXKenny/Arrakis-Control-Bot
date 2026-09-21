import { LoadType, type LavalinkResponse, type Track } from "shoukaku";
import type { MusicConfig } from "../../infrastructure/config/music";

export class MusicUserError extends Error {}

interface SearchIntent {
  title: string;
  artist?: string;
  requested: string;
}

const SEARCH_NOISE = [
  "cover", "karaoke", "reaction", "nightcore", "sped up", "slowed", "remix", "mashup", "live", "concert", "kcon", "instrumental",
  "preview", "snippet", "tribute", "fanmade", "fan made", "performance", "rehearsal",
];

export function musicQuery(value: string, source: MusicConfig["searchPrefix"]): string {
  const query = value.trim();
  if (!query || query.length > 500) throw new MusicUserError("Enter a song name or supported HTTPS link, up to 500 characters.");
  if (/^[a-z]+:\/\//i.test(query)) {
    let url: URL;
    try { url = new URL(query); } catch { throw new MusicUserError("That song link is invalid."); }
    const hosts = [
      "youtube.com", "youtu.be", "soundcloud.com", "bandcamp.com",
      "open.spotify.com", "music.apple.com", "deezer.com", "deezer.page.link",
    ];
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new MusicUserError("Use a song name or a supported HTTPS Spotify, Apple Music, Deezer, YouTube, SoundCloud, or Bandcamp link.");
    }
    return url.toString();
  }
  const intent = searchIntent(query);
  return `${source}:${intent.artist ? `${intent.title} ${intent.artist}` : intent.title}`;
}

export function loadedTracks(result: LavalinkResponse | undefined, requestedQuery?: string): Track[] {
  if (!result || result.loadType === LoadType.EMPTY) throw new MusicUserError("No matching songs were found.");
  if (result.loadType === LoadType.ERROR) throw new MusicUserError("Lavalink couldn't load that request. Check that the source is enabled on your server.");
  const tracks: Track[] = result.loadType === LoadType.TRACK ? [result.data]
    : result.loadType === LoadType.PLAYLIST ? result.data.tracks
      : requestedQuery ? bestSearchResult(result.data, searchIntent(requestedQuery))
        : result.data.slice(0, 1);
  if (!tracks.length) throw new MusicUserError("No playable songs were found.");
  return tracks;
}

function searchIntent(value: string): SearchIntent {
  const quoted = value.trim().match(/^["“”'‘’]\s*(.+?)\s*["“”'‘’]\s+by\s+(.+)$/i);
  if (quoted) return createSearchIntent(quoted[1]!, quoted[2]!);

  const cleaned = value.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
  const artistTitle = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (artistTitle) return createSearchIntent(artistTitle[2]!, artistTitle[1]!);
  return createSearchIntent(cleaned);
}

function createSearchIntent(title: string, artist?: string): SearchIntent {
  const cleanTitle = title.trim();
  const cleanArtist = artist?.trim() || undefined;
  return { title: cleanTitle, artist: cleanArtist, requested: normalize(`${cleanTitle} ${cleanArtist ?? ""}`) };
}

function bestSearchResult(tracks: readonly Track[], intent: SearchIntent): Track[] {
  let best: Track | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const track of tracks) {
    const score = searchScore(track, intent);
    if (score > bestScore) {
      best = track;
      bestScore = score;
    }
  }
  return best ? [best] : [];
}

function searchScore(track: Track, intent: SearchIntent): number {
  // Dev note: First place belongs to the best match, not the loudest cover band in the search tent.
  const requestedTitle = normalize(intent.title);
  const requestedArtist = normalize(intent.artist ?? "");
  const title = normalize(track.info.title);
  const artist = normalize(track.info.author);
  const combined = `${title} ${artist}`.trim();
  let score = tokenSimilarity(requestedTitle, title) * 14 + tokenSimilarity(intent.requested, combined) * 5;

  if (title === requestedTitle) score += 12;
  else if (title.includes(requestedTitle)) score += 5;
  if (requestedArtist) {
    score += tokenSimilarity(requestedArtist, artist) * 12;
    if (artist === requestedArtist) score += 10;
    else if (!combined.includes(requestedArtist)) score -= 8;
  }
  if (track.info.isrc) score += 4;

  for (const noise of SEARCH_NOISE) {
    if (combined.includes(noise) && !intent.requested.includes(noise)) score -= 8;
  }
  return score;
}

function tokenSimilarity(requested: string, candidate: string): number {
  const requestedTokens = new Set(requested.split(" ").filter(Boolean));
  if (!requestedTokens.size) return 0;
  const candidateTokens = new Set(candidate.split(" ").filter(Boolean));
  let matches = 0;
  for (const token of requestedTokens) if (candidateTokens.has(token)) matches++;
  return (2 * matches) / (requestedTokens.size + candidateTokens.size);
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
