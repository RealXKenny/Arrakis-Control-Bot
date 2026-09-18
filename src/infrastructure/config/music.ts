export interface MusicConfig {
  guildId: string;
  voiceChannelId: string;
  requestChannelId: string;
  url: string;
  password: string;
  secure: boolean;
  searchPrefix: "scsearch" | "ytsearch" | "ytmsearch";
  volume: number;
  maxQueue: number;
}

export function loadMusicConfig(env: NodeJS.ProcessEnv): MusicConfig | undefined {
  if (!env.LAVALINK_URL?.trim()) return undefined;
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required when music is enabled, to save the queue and playback position.");
  let url: URL;
  try { url = new URL(env.LAVALINK_URL); }
  catch { throw new Error("LAVALINK_URL must be an HTTP(S) origin, such as http://localhost:2333."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LAVALINK_URL must be an HTTP(S) origin without credentials, a path, or query parameters.");
  }
  const id = (key: string): string => {
    const value = env[key]?.trim() ?? "";
    if (!/^\d{17,20}$/.test(value)) throw new Error(`${key} must be a valid Discord ID when music is enabled.`);
    return value;
  };
  const password = env.LAVALINK_PASSWORD;
  if (!password?.trim()) throw new Error("LAVALINK_PASSWORD is required when music is enabled.");
  const searchPrefix = env.MUSIC_SEARCH_SOURCE?.trim() || "scsearch";
  if (!["scsearch", "ytsearch", "ytmsearch"].includes(searchPrefix)) throw new Error("MUSIC_SEARCH_SOURCE must be scsearch, ytsearch, or ytmsearch.");
  const volume = Number(env.MUSIC_VOLUME || 30);
  const maxQueue = Number(env.MUSIC_MAX_QUEUE || 100);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error("MUSIC_VOLUME must be an integer from 0 to 100.");
  if (!Number.isInteger(maxQueue) || maxQueue < 1 || maxQueue > 500) throw new Error("MUSIC_MAX_QUEUE must be an integer from 1 to 500.");
  const voiceChannelId = id("MUSIC_VOICE_CHANNEL_ID");
  if (voiceChannelId === env.VOICE_JOIN_CHANNEL_ID) throw new Error("The music voice channel must be separate from Join to Create.");
  return {
    guildId: id("MUSIC_GUILD_ID"), voiceChannelId, requestChannelId: id("MUSIC_REQUEST_CHANNEL_ID"),
    url: url.host, password, secure: url.protocol === "https:", searchPrefix: searchPrefix as MusicConfig["searchPrefix"], volume, maxQueue,
  };
}
