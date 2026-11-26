import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleOutageLog, retryAfterMs, retryDelayMs, routeLabel } from "../../../src/infrastructure/http/dune-console/consoleOutageLog";
import { DuneConsoleClient } from "../../../src/infrastructure/http/dune-console/DuneConsoleClient";

const failure = { method: "GET", route: "/api/server/status?raw=0", kind: "timeout" as const, durationMs: 5_001 };

function harness() {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  let now = 0;
  const log = new ConsoleOutageLog(logger, () => now);
  return { logger, log, at: (ms: number) => { now = ms; } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Console outage logging", () => {
  it("keeps a single recoverable read failure at DEBUG", () => {
    const { logger, log } = harness();
    log.recordFailure(failure, true);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("GET /api/server/status (timeout, 5001ms)"));
  });

  it("does not warn about a brief blip that recovers", () => {
    const { logger, log, at } = harness();
    log.recordFailure(failure, true);
    at(1_000);
    log.recordFailure(failure, true);
    log.recordSuccess();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("warns once for a sustained outage, summarises at most every ten minutes and reports recovery once", () => {
    const { logger, log, at } = harness();
    for (let time = 0; time <= 20 * 60_000; time += 30_000) {
      at(time);
      log.recordFailure(failure, true);
    }
    const warnings = logger.warn.mock.calls.map(([message]) => String(message));
    expect(warnings.filter((message) => message.startsWith("Dune Console unavailable"))).toHaveLength(1);
    expect(warnings.filter((message) => message.startsWith("Dune Console still unavailable")).length).toBeLessThanOrEqual(2);
    expect(log.reportedOutage).toBe(true);
    at(21 * 60_000);
    log.recordSuccess();
    log.recordSuccess();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Dune Console recovered after 1260s.");
  });

  it("always warns about a failed write", () => {
    const { logger, log } = harness();
    log.recordFailure({ ...failure, method: "POST", route: "/api/players/76561198000000000/kick" }, false);
    expect(logger.warn).toHaveBeenCalledWith("Console request failed: POST /api/players/:id/kick (timeout, 5001ms). It was not retried.");
  });

  it("never logs identifiers or query strings", () => {
    expect(routeLabel("/api/players/76561198000000000/bases?token=secret")).toBe("/api/players/:id/bases");
    expect(routeLabel("/api/guilds/abcdefghijklmnopqrstuvwxyz012345/members")).toBe("/api/guilds/:id/members");
  });
});

describe("Console retry timing", () => {
  it("backs off exponentially with jitter", () => {
    expect(retryDelayMs(1, () => 0)).toBe(200);
    expect(retryDelayMs(1, () => 1)).toBe(600);
    expect(retryDelayMs(2, () => 0.5)).toBe(800);
  });

  it("honours short Retry-After values and ignores long or malformed ones", () => {
    expect(retryAfterMs("2")).toBe(2_000);
    expect(retryAfterMs("120")).toBeNull();
    expect(retryAfterMs(new Date(5_000).toUTCString(), 0)).toBe(5_000);
    expect(retryAfterMs("soon")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });

  it("retries a rate-limited read after Retry-After and uses the configured timeout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const client = new DuneConsoleClient("https://console.example.com", "scoped-key", { timeoutMs: 7_500 });
    await expect(client.request("GET", "/api/dungeons/leaderboard")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenCalledWith(7_500);
  });

  it("never retries a write that timed out", async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");
    await expect(client.request("POST", "/api/server/restart", { body: {} })).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
