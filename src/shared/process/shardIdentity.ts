/** Discord.js ShardingManager sets SHARDS; retain the legacy single-shard override. */
export function shardId(): string {
  return process.env.SHARDS?.split(",")[0]?.trim() || process.env.DISCORD_SHARD_ID || "0";
}
export function isPrimaryShard(): boolean { return shardId() === "0"; }
