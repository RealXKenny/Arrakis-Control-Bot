/** Raised when work did not finish before its deadline. The work itself keeps running. */
class DeadlineExceededError extends Error {
  public constructor(public readonly timeoutMs: number) {
    super(`Work did not finish within ${timeoutMs}ms.`);
    this.name = "DeadlineExceededError";
  }
}

/**
 * Discord allows three seconds to acknowledge an interaction, and a modal cannot be
 * deferred, so work that must finish before `showModal` runs under this deadline.
 */
const PRE_ACKNOWLEDGEMENT_DEADLINE_MS = 2_000;

function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(timeoutMs)), timeoutMs);
    timer.unref();
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export { DeadlineExceededError, PRE_ACKNOWLEDGEMENT_DEADLINE_MS, withDeadline };
