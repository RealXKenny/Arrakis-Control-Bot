import { isRecord } from "../../shared/validation/isRecord";

export interface ChatRoute {
  guildId: string;
  channelId: string;
  map: string;
}

export interface ProximityRoute {
  guildId: string;
  channelId: string;
  /** Exact map key; omitted means proximity chat from every map. */
  map?: string;
}

export interface ProximityChatConfig {
  /** Dedicated destinations. Empty means proximity chat posts in each map's normal bridge channel(s). */
  routes: ProximityRoute[];
  /** Listen on the broker's chat.intercept feed through a filter that only passes chat.proximity (on by default). */
  intercept: boolean;
}

export interface ChatBridgeConfig {
  url: string;
  username: string;
  funcomId: string;
  displayName?: string;
  caFile?: string;
  tlsServername?: string;
  routes: ChatRoute[];
  proximity?: ProximityChatConfig;
}

export function loadChatBridgeConfig(env: NodeJS.ProcessEnv): ChatBridgeConfig | undefined {
  const value = env.RABBITMQ_URL?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
    if (!["amqp:", "amqps:"].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.hash) throw new Error();
    decodeURIComponent(url.password);
  } catch {
    throw new Error("RABBITMQ_URL must be an amqp:// or amqps:// URL with a host, username and password (URL-encode credentials).");
  }
  const username = decodeURIComponent(url.username);
  const tlsServername = env.RABBITMQ_TLS_SERVERNAME?.trim() || undefined;
  if (tlsServername && (url.protocol !== "amqps:" || tlsServername.length > 253 || !tlsServername.split(".").every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)))) {
    throw new Error("RABBITMQ_TLS_SERVERNAME must be a valid certificate DNS name and requires an amqps:// URL.");
  }
  if (!/^[a-fA-F0-9]{16}$/.test(username)) throw new Error("RABBITMQ_URL username must be the registered persona's 16-character hex account ID.");
  const funcomId = env.CHAT_BRIDGE_FUNCOM_ID?.trim();
  if (!funcomId) throw new Error("CHAT_BRIDGE_FUNCOM_ID is required when RABBITMQ_URL is set.");

  const displayName = env.CHAT_BRIDGE_DISPLAY_NAME?.trim() || undefined;
  if (displayName && (displayName.length > 80 || [...displayName].some((character) => character.charCodeAt(0) < 32))) {
    throw new Error("CHAT_BRIDGE_DISPLAY_NAME must be at most 80 characters with no control characters.");
  }
  let routes: ChatRoute[];
  try {
    const parsed: unknown = JSON.parse(env.CHAT_BRIDGE_ROUTES ?? "null");
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100) throw new Error();
    const routesSeen = new Set<string>();
    const channelGuilds = new Map<string, string>();
    for (const route of parsed as unknown[]) {
      if (!isRecord(route)) throw new Error();
      const { guildId, channelId, map } = route;
      if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId) || typeof channelId !== "string" || !/^\d{17,20}$/.test(channelId)
        || typeof map !== "string" || !/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(map)
        || routesSeen.has(`${channelId}:${map}`)
        || (channelGuilds.has(channelId) && channelGuilds.get(channelId) !== guildId)) throw new Error();
      routesSeen.add(`${channelId}:${map}`);
      channelGuilds.set(channelId, guildId);
    }
    routes = parsed as ChatRoute[];
  } catch {
    throw new Error("CHAT_BRIDGE_ROUTES must be a JSON array of unique Discord channel/map mappings: {guildId, channelId, map}, with valid Discord IDs and an exact map key such as HaggaBasin.0.");
  }
  const proximity = loadProximityConfig(env, routes);
  // Dev note: Encode the root vhost and keep a heartbeat; even bridges need a pulse.
  if (!url.pathname || url.pathname === "/") url.pathname = "/%2F";
  url.searchParams.set("heartbeat", "30");
  return { url: url.toString(), username, funcomId, displayName, routes, proximity, caFile: env.RABBITMQ_CA_FILE?.trim() || undefined, tlsServername };
}

const MAP_KEY = /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;

function parseSwitch(name: string, value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  throw new Error(`${name} must be on or off.`);
}

function loadProximityConfig(env: NodeJS.ProcessEnv, mapRoutes: ChatRoute[]): ProximityChatConfig | undefined {
  let routes: ProximityRoute[] = [];
  if (env.CHAT_BRIDGE_PROXIMITY_ROUTES?.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.CHAT_BRIDGE_PROXIMITY_ROUTES);
      if (!Array.isArray(parsed) || parsed.length > 100) throw new Error();
      const seen = new Set<string>();
      const channelGuilds = new Map(mapRoutes.map((route) => [route.channelId, route.guildId]));
      routes = (parsed as unknown[]).map((route) => {
        if (!isRecord(route)) throw new Error();
        const { guildId, channelId, map } = route;
        if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId) || typeof channelId !== "string" || !/^\d{17,20}$/.test(channelId)
          || (map !== undefined && (typeof map !== "string" || !MAP_KEY.test(map)))
          || seen.has(`${channelId}:${map ?? "*"}`)
          || (channelGuilds.has(channelId) && channelGuilds.get(channelId) !== guildId)) throw new Error();
        seen.add(`${channelId}:${map ?? "*"}`);
        channelGuilds.set(channelId, guildId);
        return map === undefined ? { guildId, channelId } : { guildId, channelId, map };
      });
    } catch {
      throw new Error("CHAT_BRIDGE_PROXIMITY_ROUTES must be a JSON array of unique {guildId, channelId} destinations with valid Discord IDs and an optional exact map key such as HaggaBasin.0.");
    }
  }
  // Dev note: Whispers carried on the wind stay off unless the owner asks for them.
  const enabled = parseSwitch("CHAT_BRIDGE_PROXIMITY", env.CHAT_BRIDGE_PROXIMITY) ?? routes.length > 0;
  if (!enabled) return undefined;
  return { routes, intercept: parseSwitch("CHAT_BRIDGE_PROXIMITY_INTERCEPT", env.CHAT_BRIDGE_PROXIMITY_INTERCEPT) ?? true };
}
