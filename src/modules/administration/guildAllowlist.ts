import type { Client, Guild } from "discord.js";

interface AllowlistLogger {
  warn(message: string): void;
  error(message: string, details?: unknown): void;
}

/** An empty allowlist keeps the legacy behavior of serving every guild. */
export function isAllowedGuild(allowed: readonly string[], guildId: string): boolean {
  return allowed.length === 0 || allowed.includes(guildId);
}

/** Confirms, from Discord's full guild list rather than one shard's cache,
 * that at least one allowed guild is present. Leaving guilds when the
 * allowlist is misconfigured would take the bot out of its own community.
 */
async function allowlistIsPresent(client: Client, allowed: readonly string[]): Promise<boolean> {
  const guilds = await client.guilds.fetch();
  return allowed.some((guildId) => guilds.has(guildId));
}

/** Leaves one guild that is not on the allowlist. Returns true when it left. */
export async function leaveIfUnauthorized(client: Client, guild: Guild, allowed: readonly string[], logger: AllowlistLogger): Promise<boolean> {
  if (isAllowedGuild(allowed, guild.id)) return false;
  try {
    if (!await allowlistIsPresent(client, allowed)) {
      logger.error(`Not leaving guild ${guild.id}: none of ALLOWED_GUILD_IDS is in the bot's guild list. Check the configuration.`);
      return false;
    }
    // Dev note: Wrong sietch. The bot politely backs out of the tent.
    await guild.leave();
    logger.warn(`Left unauthorized guild ${guild.id}. Only ALLOWED_GUILD_IDS may use this bot.`);
    return true;
  } catch (error) {
    logger.error(`Unable to leave unauthorized guild ${guild.id}.`, error);
    return false;
  }
}

/** Leaves every cached guild on this shard that is not on the allowlist. */
export async function leaveUnauthorizedGuilds(client: Client, allowed: readonly string[], logger: AllowlistLogger): Promise<number> {
  if (allowed.length === 0) return 0;
  let left = 0;
  for (const guild of [...client.guilds.cache.values()]) {
    if (await leaveIfUnauthorized(client, guild, allowed, logger)) left++;
  }
  return left;
}
