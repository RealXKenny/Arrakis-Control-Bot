export function shardId(): string {
  // Dev note: SHARDS is plural, but every process still needs one identity crisis.
  return process.env.SHARDS?.split(",")[0]?.trim() || process.env.DISCORD_SHARD_ID || "0";
}
export function isPrimaryShard(): boolean { return shardId() === "0"; }
