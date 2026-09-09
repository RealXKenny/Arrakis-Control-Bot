interface ProcessError extends Error {
  code?: string;
}

function monitorParentProcess(onParentExit: () => void, intervalMs = 1_000): NodeJS.Timeout | null {
  const parentPid = process.ppid;

  if (!Number.isInteger(parentPid) || parentPid <= 1) {
    return null;
  }

  const interval = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch (error) {
      if ((error as ProcessError).code !== "ESRCH") {
        return;
      }

      clearInterval(interval);
      onParentExit();
    }
  }, intervalMs);

  interval.unref();
  return interval;
}

export { monitorParentProcess };
