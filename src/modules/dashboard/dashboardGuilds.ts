import { ShardClientUtil, type Client } from "discord.js";

export interface DashboardGuild { id: string; name: string; icon: string | null }
export interface DashboardOption { label: string; value: string }
export type DashboardResourceKind = "channel" | "role";
export interface DashboardResourceFilter { types?: string[]; hideNsfw?: boolean; onlyNsfw?: boolean; hideHigher?: boolean; includeBots?: boolean }

const SNOWFLAKE = /^[1-9]\d{16,19}$/;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_GUILDS_PER_SHARD = 100;
const MAX_OPTIONS = 500;
const CHANNEL_TYPES: Record<string, number[]> = {
  text: [0], voice: [2], category: [4], announcement: [5], news: [5], thread: [10, 11, 12], stage: [13], forum: [15], media: [16],
};

interface ListContext { userId: string; maxGuilds: number }
interface ResourceContext { guildId: string; kind: DashboardResourceKind; filter: DashboardResourceFilter; channelTypes: Record<string, number[]>; maxOptions: number }

// Serialized by discord.js and run on each shard; keep it self-contained.
async function listOnShard(client: Client, context: ListContext): Promise<{ id: string; name: string; icon: string | null }[]> {
  const result: { id: string; name: string; icon: string | null }[] = [];
  for (const guild of [...client.guilds.cache.values()].slice(0, context.maxGuilds)) {
    if (!guild.available) continue;
    try {
      // Listing is a hint only; every guild request repeats a forced check.
      const member = await guild.members.fetch({ user: context.userId });
      if (member.id === guild.ownerId || member.permissions.has("ManageGuild")) result.push({ id: guild.id, name: guild.name, icon: guild.icon });
    } catch { /* Not a member or Discord is unavailable: omit the guild. */ }
  }
  return result;
}

// Serialized by discord.js and run on the owning shard; keep it self-contained.
function resourcesOnShard(client: Client, context: ResourceContext): { label: string; value: string }[] | null {
  const guild = client.guilds.cache.get(context.guildId);
  if (!guild || !guild.available) return null;
  const out: { label: string; value: string }[] = [];
  if (context.kind === "channel") {
    const types = context.filter.types?.length ? new Set(context.filter.types.flatMap((type) => context.channelTypes[type] ?? [])) : null;
    for (const channel of guild.channels.cache.values()) {
      if (types && !types.has(channel.type)) continue;
      const nsfw = "nsfw" in channel && channel.nsfw === true;
      if ((context.filter.hideNsfw && nsfw) || (context.filter.onlyNsfw && !nsfw)) continue;
      out.push({ label: channel.name, value: channel.id });
    }
  } else {
    const ceiling = context.filter.hideHigher ? guild.members.me?.roles.highest.position ?? 0 : undefined;
    for (const role of guild.roles.cache.values()) {
      if (role.id === guild.id || (role.managed && !context.filter.includeBots)) continue;
      if (ceiling !== undefined && role.position >= ceiling) continue;
      out.push({ label: role.name, value: role.id });
    }
  }
  return out.slice(0, context.maxOptions);
}

/** Lists guilds, across every shard, that the user appears to manage. Returns null when any shard is unavailable. */
export async function listDashboardGuilds(client: Client, userId: string): Promise<DashboardGuild[] | null> {
  if (!SNOWFLAKE.test(userId)) return [];
  const context = { userId, maxGuilds: MAX_GUILDS_PER_SHARD };
  const lists = await withTimeout(client.shard ? client.shard.broadcastEval(listOnShard, { context }) : listOnShard(client, context).then((list) => [list]));
  if (!lists) return null;
  return lists.flat().filter(isGuild).sort((a, b) => a.name.localeCompare(b.name));
}

/** Reads channel or role options from the shard that owns the guild. */
export async function listDashboardResources(client: Client, guildId: string, kind: DashboardResourceKind,
  filter: DashboardResourceFilter = {}): Promise<DashboardOption[]> {
  if (!SNOWFLAKE.test(guildId)) return [];
  const context = { guildId, kind, filter: sanitizeFilter(filter), channelTypes: CHANNEL_TYPES, maxOptions: MAX_OPTIONS };
  const options = await withTimeout(client.shard
    ? client.shard.broadcastEval(resourcesOnShard, { context, shard: ShardClientUtil.shardIdForGuildId(guildId, client.shard.count) })
    : Promise.resolve(resourcesOnShard(client, context)));
  if (!Array.isArray(options)) throw new Error("Guild resources are unavailable");
  return options.filter((option): option is DashboardOption => typeof option?.label === "string" && typeof option.value === "string" && SNOWFLAKE.test(option.value));
}

function sanitizeFilter(filter: DashboardResourceFilter): DashboardResourceFilter {
  return {
    types: Array.isArray(filter.types) ? filter.types.filter((type) => typeof type === "string" && type in CHANNEL_TYPES).slice(0, 10) : undefined,
    hideNsfw: filter.hideNsfw === true, onlyNsfw: filter.onlyNsfw === true,
    hideHigher: filter.hideHigher === true, includeBots: filter.includeBots === true,
  };
}

function isGuild(value: unknown): value is DashboardGuild {
  if (typeof value !== "object" || value === null) return false;
  const guild = value as Record<string, unknown>;
  return typeof guild.id === "string" && SNOWFLAKE.test(guild.id) && typeof guild.name === "string" &&
    (guild.icon === null || typeof guild.icon === "string");
}

async function withTimeout<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS); })]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
