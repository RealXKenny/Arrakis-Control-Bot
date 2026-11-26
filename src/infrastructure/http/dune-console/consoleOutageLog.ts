/**
 * Outage-aware logging for Dune Console reads. One timed-out status read is routine on a busy game server and is
 * logged at DEBUG; a sustained outage produces one WARN, a short summary at most every ten minutes, and one INFO line
 * when the Console answers again. Failed writes are always warned about, because a person is waiting on them.
 *
 * Routes are logged without query strings, and numeric or long opaque path segments become `:id`, so player and
 * account identifiers never reach the console.
 */

interface OutageLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}

interface ConsoleFailure {
  method: string;
  route: string;
  /** `network`, `timeout` or `status`. */
  kind: "network" | "timeout" | "status";
  status?: number;
  durationMs: number;
}

/** Failures in a row, and for how long, before a read outage is reported. */
const OUTAGE_WARN_AFTER_FAILURES = 3;
const OUTAGE_WARN_AFTER_MS = 60_000;
const OUTAGE_SUMMARY_EVERY_MS = 10 * 60_000;

function routeLabel(route: string): string {
  const path = route.split("?")[0] ?? "";
  return path
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) || /^[A-Za-z0-9_-]{24,}$/.test(segment) ? ":id" : segment))
    .join("/");
}

function describe(failure: ConsoleFailure): string {
  const reason = failure.kind === "status" ? `HTTP ${failure.status ?? 0}` : failure.kind;
  return `${failure.method} ${routeLabel(failure.route)} (${reason}, ${failure.durationMs}ms)`;
}

class ConsoleOutageLog {
  private consecutiveFailures = 0;
  private firstFailureAt: number | null = null;
  private warnedAt: number | null = null;
  private summarizedAt: number | null = null;
  private failuresSinceSummary = 0;

  public constructor(private readonly logger: OutageLogger, private readonly now: () => number = Date.now) {}

  /** True while a reported read outage is in progress. */
  public get reportedOutage(): boolean {
    return this.warnedAt !== null;
  }

  public recordFailure(failure: ConsoleFailure, read: boolean): void {
    if (!read) {
      this.logger.warn(`Console request failed: ${describe(failure)}. It was not retried.`);
      return;
    }
    const now = this.now();
    this.consecutiveFailures += 1;
    this.failuresSinceSummary += 1;
    this.firstFailureAt ??= now;
    this.logger.debug(`Console read failed: ${describe(failure)}; ${this.consecutiveFailures} in a row.`);

    const sustained =
      this.consecutiveFailures >= OUTAGE_WARN_AFTER_FAILURES && now - this.firstFailureAt >= OUTAGE_WARN_AFTER_MS;
    if (sustained && this.warnedAt === null) {
      this.warnedAt = now;
      this.summarizedAt = now;
      this.failuresSinceSummary = 0;
      // Dev note: One sandworm sighting is news; announcing every ripple in the sand is just noise.
      this.logger.warn(
        `Dune Console unavailable for ${Math.round((now - this.firstFailureAt) / 1_000)}s ` +
          `(${this.consecutiveFailures} failed reads, last ${describe(failure)}). Cached data is used where available.`,
      );
      return;
    }
    if (this.warnedAt !== null && this.summarizedAt !== null && now - this.summarizedAt >= OUTAGE_SUMMARY_EVERY_MS) {
      this.logger.warn(
        `Dune Console still unavailable after ${Math.round((now - (this.firstFailureAt ?? now)) / 60_000)} minutes ` +
          `(${this.failuresSinceSummary} failed reads since the last update, last ${describe(failure)}).`,
      );
      this.summarizedAt = now;
      this.failuresSinceSummary = 0;
    }
  }

  public recordSuccess(): void {
    if (this.warnedAt !== null) {
      const seconds = Math.round((this.now() - (this.firstFailureAt ?? this.now())) / 1_000);
      this.logger.info(`Dune Console recovered after ${seconds}s.`);
    }
    this.consecutiveFailures = 0;
    this.firstFailureAt = null;
    this.warnedAt = null;
    this.summarizedAt = null;
    this.failuresSinceSummary = 0;
  }
}

/** Exponential backoff with jitter: about 200-600 ms, then 400-1200 ms. */
function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = 400 * 2 ** (attempt - 1);
  return Math.round(ceiling / 2 + random() * ceiling);
}

/** Honours a short Retry-After (seconds or HTTP date); anything over ten seconds is not worth waiting for. */
function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  const delay = /^\d+$/.test(trimmed) ? Number(trimmed) * 1_000 : Date.parse(trimmed) - now;
  if (!Number.isFinite(delay) || delay < 0 || delay > 10_000) return null;
  return delay;
}

export { ConsoleOutageLog, retryAfterMs, retryDelayMs, routeLabel };
export type { ConsoleFailure, OutageLogger };
