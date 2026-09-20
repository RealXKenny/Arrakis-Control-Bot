interface CleanupTask {
  name: string;
  run: () => unknown | Promise<unknown>;
}

export async function cleanupResources(
  tasks: CleanupTask[],
  onError: (name: string, error: unknown) => void,
  onTimeout: () => void,
  timeoutMs = 10_000,
): Promise<void> {
  // Dev note: Everyone gets a lifeboat, even when one shutdown task sinks.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = Promise.all(tasks.map(async ({ name, run }) => {
    try {
      await run();
    } catch (error) {
      onError(name, error);
    }
  }));
  try {
    await Promise.race([
      cleanup,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => { onTimeout(); resolve(); }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
