export interface RateLimitStore {
  get(key: string): number | undefined;
  set(key: string, expiresAt: number): void;
  delete(key: string): void;
  sweep(now: number): void;
  readonly size: number;
}

export interface InMemoryRateLimitStoreOptions {
  maxEntries: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, number>();
  private readonly maxEntries: number;

  constructor(options: InMemoryRateLimitStoreOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new Error("Rate-limit store maxEntries must be a positive integer.");
    }

    this.maxEntries = options.maxEntries;
  }

  get(key: string): number | undefined {
    return this.entries.get(key);
  }

  set(key: string, expiresAt: number): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldestKey = this.entries.keys().next().value;

      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(key, expiresAt);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  sweep(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface RateLimiterOptions {
  durationMs: number;
  store: RateLimitStore;
}

export class RateLimiter {
  private readonly durationMs: number;
  private readonly store: RateLimitStore;

  constructor(options: RateLimiterOptions) {
    if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) {
      throw new Error("Rate-limit durationMs must be a positive number.");
    }

    this.durationMs = options.durationMs;
    this.store = options.store;
  }

  allow(key: string, now = Date.now()): boolean {
    this.store.sweep(now);

    const expiresAt = this.store.get(key);

    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }

    this.store.set(key, now + this.durationMs);
    return true;
  }

  get size(): number {
    return this.store.size;
  }
}
