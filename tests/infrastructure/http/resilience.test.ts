import { afterEach, describe, expect, it, vi } from "vitest";

import { DuneConsoleClient } from "../../../src/infrastructure/http/dune-console/DuneConsoleClient";
import { CircuitBreaker, CircuitOpenError, ConcurrencyLimiter, ConcurrencyLimitError, TtlCache, upstreamArea } from "../../../src/infrastructure/http/resilience";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CircuitBreaker", () => {
  it("opens after repeated failures, fails fast, then closes after a successful trial", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, openMs: 1_000, now: () => now });
    const fail = () => Promise.reject(new Error("down"));
    await expect(breaker.run("api/server", fail)).rejects.toThrow("down");
    await expect(breaker.run("api/server", fail)).rejects.toThrow("down");
    const work = vi.fn().mockResolvedValue("ok");
    await expect(breaker.run("api/server", work)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(work).not.toHaveBeenCalled();
    await expect(breaker.run("api/players", work)).resolves.toBe("ok");

    now = 1_000;
    await expect(breaker.run("api/server", work)).resolves.toBe("ok");
    expect(breaker.isOpen("api/server")).toBe(false);
  });

  it("reopens when the trial fails and ignores errors that are not upstream failures", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 1_000, now: () => now });
    await expect(breaker.run("k", () => Promise.reject(new Error("not found")), () => false)).rejects.toThrow();
    expect(breaker.isOpen("k")).toBe(false);
    await expect(breaker.run("k", () => Promise.reject(new Error("down")))).rejects.toThrow();
    now = 1_000;
    await expect(breaker.run("k", () => Promise.reject(new Error("still down")))).rejects.toThrow("still down");
    expect(breaker.openKeys()).toEqual(["k"]);
  });
});

describe("ConcurrencyLimiter", () => {
  it("runs at most N at once and rejects when the queue is full", async () => {
    const limiter = new ConcurrencyLimiter(1, 1);
    let release!: () => void;
    const first = limiter.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const second = limiter.run(() => Promise.resolve("second"));
    expect(limiter.activeCount).toBe(1);
    expect(limiter.queuedCount).toBe(1);
    await expect(limiter.run(() => Promise.resolve("third"))).rejects.toBeInstanceOf(ConcurrencyLimitError);
    release();
    await first;
    await expect(second).resolves.toBe("second");
    expect(limiter.activeCount).toBe(0);
  });
});

describe("TtlCache", () => {
  it("shares in-flight loads and expires entries", async () => {
    let now = 0;
    const cache = new TtlCache(10, () => now);
    const load = vi.fn().mockResolvedValue("value");
    await Promise.all([cache.getOrLoad("k", 100, load), cache.getOrLoad("k", 100, load)]);
    await cache.getOrLoad("k", 100, load);
    expect(load).toHaveBeenCalledOnce();
    now = 100;
    await cache.getOrLoad("k", 100, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep failures", async () => {
    const cache = new TtlCache();
    await expect(cache.getOrLoad("k", 1_000, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(cache.getOrLoad("k", 1_000, () => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});

it("groups routes by their first two path segments", () => {
  expect(upstreamArea("/api/server/status?x=1")).toBe("api/server");
  expect(upstreamArea("/api/players/7/inventory")).toBe("api/players");
});

describe("DuneConsoleClient resilience", () => {
  it("fails fast with a safe 503 after repeated server errors", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 500 })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");
    for (let index = 0; index < 5; index += 1) {
      const pending = client.request("POST", "/api/server/restart", { body: {} });
      await expect(pending).rejects.toMatchObject({ status: 500 });
    }
    const calls = fetchMock.mock.calls.length;
    await expect(client.request("POST", "/api/server/restart", { body: {} })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(client.openCircuits).toEqual(["api/server"]);
  });

  it("shares one upstream call between identical concurrent GETs and caches when asked", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");
    await Promise.all([client.request("GET", "/api/server/status"), client.request("GET", "/api/server/status")]);
    expect(fetchMock).toHaveBeenCalledOnce();
    await client.request("GET", "/api/server/status", { cacheTtlMs: 10_000 });
    await client.request("GET", "/api/server/status", { cacheTtlMs: 10_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
