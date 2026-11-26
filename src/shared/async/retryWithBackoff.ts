interface RetryOptions {
  /** First wait after a failure. Doubles each time, up to maxDelayMs. */
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Stop retrying (and rethrow the last error) once this returns true. */
  shouldStop?: () => boolean;
  /** Errors this rejects are rethrown at once, such as a configuration problem a retry cannot fix. */
  retryIf?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries until work succeeds or shouldStop says to give up. Use only for idempotent work. */
async function retryWithBackoff<T>(work: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { initialDelayMs = 2_000, maxDelayMs = 60_000, shouldStop = () => false, retryIf = () => true, onRetry, sleep = defaultSleep } = options;
  let delayMs = initialDelayMs;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (shouldStop() || !retryIf(error)) throw error;
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
      if (shouldStop()) throw error;
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}

export { retryWithBackoff };
