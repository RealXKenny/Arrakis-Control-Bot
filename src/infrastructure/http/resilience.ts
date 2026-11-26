/**
 * Small, process-local guards for outbound HTTP: a circuit breaker per upstream area,
 * a concurrency limit with a bounded wait queue, and a short TTL cache that also
 * coalesces identical in-flight reads.
 */

class CircuitOpenError extends Error {
  public constructor(public readonly key: string, public readonly retryAfterMs: number) {
    super(`Upstream ${key} is temporarily unavailable; retry in ${Math.ceil(retryAfterMs / 1_000)}s.`);
    this.name = "CircuitOpenError";
  }
}

class ConcurrencyLimitError extends Error {
  public constructor() {
    super("Too many requests are already waiting for this service.");
    this.name = "ConcurrencyLimitError";
  }
}

interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before one trial request is allowed. */
  openMs?: number;
  now?: () => number;
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
  trialInFlight: boolean;
}

class CircuitBreaker {
  private readonly states = new Map<string, CircuitState>();
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  public constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.openMs = options.openMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Runs work unless the circuit for key is open. `isFailure` decides which errors count:
   * a client error such as 404 means the upstream is healthy and must not open the circuit.
   */
  public async run<T>(key: string, work: () => Promise<T>, isFailure: (error: unknown) => boolean = () => true): Promise<T> {
    const state = this.states.get(key) ?? { failures: 0, openedAt: null, trialInFlight: false };
    this.states.set(key, state);
    let trial = false;

    if (state.openedAt !== null) {
      const elapsed = this.now() - state.openedAt;
      if (elapsed < this.openMs || state.trialInFlight) throw new CircuitOpenError(key, Math.max(0, this.openMs - elapsed));
      state.trialInFlight = true;
      trial = true;
    }

    try {
      const result = await work();
      state.failures = 0;
      state.openedAt = null;
      return result;
    } catch (error) {
      if (isFailure(error)) {
        state.failures += 1;
        if (trial || state.failures >= this.failureThreshold) state.openedAt = this.now();
      } else if (trial) {
        state.openedAt = null;
        state.failures = 0;
      }
      throw error;
    } finally {
      if (trial) state.trialInFlight = false;
    }
  }

  public isOpen(key: string): boolean {
    const state = this.states.get(key);
    return Boolean(state?.openedAt !== null && state?.openedAt !== undefined && this.now() - state.openedAt < this.openMs);
  }

  public openKeys(): string[] {
    return [...this.states.keys()].filter((key) => this.isOpen(key));
  }
}

class ConcurrencyLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(private readonly maxConcurrent = 8, private readonly maxQueued = 100) {}

  public get activeCount(): number { return this.active; }
  public get queuedCount(): number { return this.waiting.length; }

  public async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueued) throw new ConcurrencyLimitError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      // Hand the slot straight to the next waiter so the active count never dips and races.
      if (next) next();
      else this.active -= 1;
    }
  }
}

interface CacheEntry<T> { value: T; expiresAt: number }

class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  public constructor(private readonly maxEntries = 500, private readonly now: () => number = Date.now) {}

  /** Returns a cached value, joins an identical request already running, or loads a new one. */
  public async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.value as T;
    if (cached) this.entries.delete(key);

    const running = this.inFlight.get(key);
    if (running) return running as Promise<T>;

    const loading = load().then((value) => {
      if (ttlMs > 0) this.store(key, value, ttlMs);
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, loading);
    return loading;
  }

  public clear(): void { this.entries.clear(); }

  public get size(): number { return this.entries.size; }

  private store(key: string, value: unknown, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}

/** Groups routes by their first two path segments, so one failing area does not block the rest. */
function upstreamArea(route: string): string {
  const path = route.split("?")[0] ?? "";
  return path.split("/").filter(Boolean).slice(0, 2).join("/") || "/";
}

export { CircuitBreaker, CircuitOpenError, ConcurrencyLimiter, ConcurrencyLimitError, TtlCache, upstreamArea };
export type { CircuitBreakerOptions };
