interface ShardSpawner {
  spawn(): Promise<unknown>;
}

/** A partial spawn can leave live child shards, so a failure must stop the manager. */
export async function startShardManager(
  manager: ShardSpawner,
  reportFailure: (error: unknown) => void,
  stopAfterFailure: () => void,
): Promise<void> {
  try {
    await manager.spawn();
  } catch (error) {
    reportFailure(error);
    stopAfterFailure();
  }
}
