import { describe, expect, it } from "vitest";

import { InMemoryRateLimitStore, RateLimiter } from "../../src/infrastructure/rateLimit/rateLimiter";

describe("RateLimiter", () => {
  it("allows once per TTL and allows again after expiry", () => {
    const limiter = new RateLimiter({
      durationMs: 100,
      store: new InMemoryRateLimitStore({ maxEntries: 10 }),
    });

    expect(limiter.allow("user:command", 1_000)).toBe(true);
    expect(limiter.allow("user:command", 1_050)).toBe(false);
    expect(limiter.allow("user:command", 1_100)).toBe(true);
  });

  it("sweeps expired entries and evicts the oldest bounded entry", () => {
    const store = new InMemoryRateLimitStore({ maxEntries: 2 });
    const limiter = new RateLimiter({ durationMs: 100, store });

    expect(limiter.allow("first", 1_000)).toBe(true);
    expect(limiter.allow("second", 1_001)).toBe(true);
    expect(limiter.allow("third", 1_002)).toBe(true);
    expect(store.size).toBe(2);
    expect(limiter.allow("first", 1_003)).toBe(true);

    expect(limiter.allow("second", 1_200)).toBe(true);
    expect(store.size).toBe(1);
  });
});
