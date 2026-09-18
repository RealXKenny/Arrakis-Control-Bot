import { LoadType, type LavalinkResponse, type Track } from "shoukaku";
import type { MusicConfig } from "../../infrastructure/config/music";

export class MusicUserError extends Error {}

export function musicQuery(value: string, source: MusicConfig["searchPrefix"]): string {
  const query = value.trim();
  if (!query || query.length > 500) throw new MusicUserError("Enter a song name or supported HTTPS link, up to 500 characters.");
  if (/^[a-z]+:\/\//i.test(query)) {
    let url: URL;
    try { url = new URL(query); } catch { throw new MusicUserError("That song link is invalid."); }
    const hosts = ["youtube.com", "youtu.be", "soundcloud.com", "bandcamp.com"];
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new MusicUserError("Use a song name or an HTTPS YouTube, SoundCloud, or Bandcamp link supported by your Lavalink server.");
    }
    return url.toString();
  }
  return `${source}:${query}`;
}

export function loadedTracks(result: LavalinkResponse | undefined): Track[] {
  if (!result || result.loadType === LoadType.EMPTY) throw new MusicUserError("No matching songs were found.");
  if (result.loadType === LoadType.ERROR) throw new MusicUserError("Lavalink couldn't load that request. Check that the source is enabled on your server.");
  const tracks = result.loadType === LoadType.TRACK ? [result.data]
    : result.loadType === LoadType.PLAYLIST ? result.data.tracks : result.data.slice(0, 1);
  if (!tracks.length) throw new MusicUserError("No playable songs were found.");
  return tracks;
}
