export interface MusicConfig {
  guildId: string;
  voiceChannelId: string;
  requestChannelId: string;
  url: string;
  password: string;
  secure: boolean;
  searchPrefix: "scsearch" | "ytsearch" | "ytmsearch" | "spsearch" | "amsearch" | "dzsearch";
  volume: number;
  maxQueue: number;
  idlePlaylistUrl?: string;
}

export function loadMusicConfig(env: NodeJS.ProcessEnv): MusicConfig | undefined {
  if (!env.LAVALINK_URL?.trim()) return undefined;
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required when music is enabled, to save the queue and playback position.");
  let url: URL;
  try { url = new URL(env.LAVALINK_URL); }
  catch { throw new Error("LAVALINK_URL must be an HTTP(S) origin, such as http://localhost:2333."); }
  // Dev note: Lavalink gets an origin, not a scenic URL tour with credentials in the luggage.
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LAVALINK_URL must be an HTTP(S) origin without credentials, a path, or query parameters.");
  }
  const id = (key: string): string => {
    const value = env[key]?.trim() ?? "";
    if (!/^\d{17,20}$/.test(value)) throw new Error(`${key} must be a valid Discord ID when music is enabled.`);
    return value;
  };
  const guildId = env.MUSIC_GUILD_ID?.trim() || env.GUILD_ID?.trim();
  if (!guildId || !/^\d{17,20}$/.test(guildId)) throw new Error("GUILD_ID must be a valid Discord ID when music is enabled.");
  const password = env.LAVALINK_PASSWORD;
  if (!password?.trim()) throw new Error("LAVALINK_PASSWORD is required when music is enabled.");
  const searchPrefix = env.MUSIC_SEARCH_SOURCE?.trim() || "scsearch";
  const supportedSearchSources: readonly MusicConfig["searchPrefix"][] = ["scsearch", "ytsearch", "ytmsearch", "spsearch", "amsearch", "dzsearch"];
  if (!supportedSearchSources.includes(searchPrefix as MusicConfig["searchPrefix"])) {
    throw new Error("MUSIC_SEARCH_SOURCE must be scsearch, ytsearch, ytmsearch, spsearch, amsearch, or dzsearch.");
  }
  const volume = Number(env.MUSIC_VOLUME || 100);
  const maxQueue = Number(env.MUSIC_MAX_QUEUE || 100);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error("MUSIC_VOLUME must be an integer from 0 to 100.");
  if (!Number.isInteger(maxQueue) || maxQueue < 1 || maxQueue > 500) throw new Error("MUSIC_MAX_QUEUE must be an integer from 1 to 500.");
  const voiceChannelId = id("MUSIC_VOICE_CHANNEL_ID");
  if (voiceChannelId === env.VOICE_JOIN_CHANNEL_ID) throw new Error("The music voice channel must be separate from Join to Create.");
  const idlePlaylistUrl = optionalIdlePlaylistUrl(env.MUSIC_IDLE_PLAYLIST_URL);
  return {
    guildId, voiceChannelId, requestChannelId: id("MUSIC_REQUEST_CHANNEL_ID"),
    url: url.host, password, secure: url.protocol === "https:", searchPrefix: searchPrefix as MusicConfig["searchPrefix"], volume, maxQueue, idlePlaylistUrl,
  };
}

function optionalIdlePlaylistUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  let url: URL;
  try { url = new URL(normalized); }
  catch { throw new Error("MUSIC_IDLE_PLAYLIST_URL must be a supported HTTPS album or playlist URL."); }
  const hosts = ["open.spotify.com", "music.apple.com", "deezer.com", "soundcloud.com"];
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error("MUSIC_IDLE_PLAYLIST_URL must be a supported HTTPS Spotify, Apple Music, Deezer, or SoundCloud album or playlist URL.");
  }
  return url.toString();
}
