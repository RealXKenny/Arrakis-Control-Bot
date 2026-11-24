import { ShardClientUtil, type Client } from "discord.js";

type Decision = "allowed" | "denied" | "unavailable";
interface RequestContext { guildId: string; userId: string }
const SNOWFLAKE = /^[1-9]\d{16,19}$/;
const REQUEST_TIMEOUT_MS = 5_000;

// This function is serialized by discord.js; keep it self-contained.
async function authorizeOnShard(client: Client, context: RequestContext): Promise<Decision> {
  const guild = client.guilds.cache.get(context.guildId);
  if (!guild || !guild.available) return "unavailable";
  try {
    await guild.fetch();
    await guild.roles.fetch();
    const member = await guild.members.fetch({ user: context.userId, force: true });
    return member.id === guild.ownerId || member.permissions.has("ManageGuild") ? "allowed" : "denied";
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 10007) return "denied";
    return "unavailable";
  }
}

/** Performs a fresh permission check on the shard that owns the requested guild. */
export async function authorizeDashboardGuild(client: Client, guildId: string, userId: string): Promise<Decision> {
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) return "denied";
  const context = { guildId, userId };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = client.shard
      ? client.shard.broadcastEval(authorizeOnShard, {
        context,
        shard: ShardClientUtil.shardIdForGuildId(guildId, client.shard.count),
      })
      : authorizeOnShard(client, context);
    const decision = await Promise.race([
      work,
      new Promise<Decision>((resolve) => { timer = setTimeout(() => resolve("unavailable"), REQUEST_TIMEOUT_MS); }),
    ]);
    return decision === "allowed" || decision === "denied" ? decision : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}
