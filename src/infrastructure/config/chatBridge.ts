export interface ChatRoute {
  guildId: string;
  channelId: string;
  map: string;
}

export interface ChatBridgeConfig {
  url: string;
  username: string;
  funcomId: string;
  displayName?: string;
  caFile?: string;
  tlsServername?: string;
  routes: ChatRoute[];
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
    for (const route of parsed) {
      if (!route || !/^\d{17,20}$/.test(route.guildId) || !/^\d{17,20}$/.test(route.channelId)
        || typeof route.map !== "string" || !/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(route.map)
        || routesSeen.has(`${route.channelId}:${route.map}`)
        || (channelGuilds.has(route.channelId) && channelGuilds.get(route.channelId) !== route.guildId)) throw new Error();
      routesSeen.add(`${route.channelId}:${route.map}`);
      channelGuilds.set(route.channelId, route.guildId);
    }
    routes = parsed;
  } catch {
    throw new Error("CHAT_BRIDGE_ROUTES must be a JSON array of unique Discord channel/map mappings: {guildId, channelId, map}, with valid Discord IDs and an exact map key such as HaggaBasin.0.");
  }
  // Explicitly encode the root vhost; heartbeat detects broken remote connections.
  if (!url.pathname || url.pathname === "/") url.pathname = "/%2F";
  url.searchParams.set("heartbeat", "30");
  return { url: url.toString(), username, funcomId, displayName, routes, caFile: env.RABBITMQ_CA_FILE?.trim() || undefined, tlsServername };
}
