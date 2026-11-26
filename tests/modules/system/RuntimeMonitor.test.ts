import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatSnapshot, RuntimeMonitor, snapshotWarnings, type RuntimeProbes } from "../../../src/modules/system/RuntimeMonitor";

const pools = { interactive: { total: 10, idle: 2, waiting: 3 }, background: { total: 5, idle: 5, waiting: 0 } };
const probes = (overrides: Partial<RuntimeProbes> = {}): RuntimeProbes => ({
  gatewayReady: () => true,
  gatewayPingMs: () => 42,
  databasePing: () => Promise.resolve(),
  poolStats: () => pools,
  archiveBuffered: () => 12,
  openCircuits: () => [],
  cachedMessages: () => 300,
  ...overrides,
});
const options = { intervalMs: 1_000, info: vi.fn(), warn: vi.fn() };

afterEach(() => vi.useRealTimers());

describe("RuntimeMonitor", () => {
  it("reports ready only when the gateway and database are both up", async () => {
    expect((await new RuntimeMonitor(probes(), options).snapshot()).ready).toBe(true);
    const down = await new RuntimeMonitor(probes({ databasePing: () => Promise.reject(new Error("refused")) }), options).snapshot();
    expect(down.ready).toBe(false);
    expect(down.database.healthy).toBe(false);
    const noDatabase = await new RuntimeMonitor(probes({ databasePing: undefined }), options).snapshot();
    expect(noDatabase.ready).toBe(true);
    expect(noDatabase.database.configured).toBe(false);
  });

  it("treats a database ping that hangs as down", async () => {
    vi.useFakeTimers();
    const pending = new RuntimeMonitor(probes({ databasePing: () => new Promise<void>(() => undefined) }), options).snapshot();
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await pending).database.healthy).toBe(false);
  });

  it("summarizes on one line and warns about pressure, outages and open circuits", async () => {
    const monitor = new RuntimeMonitor(probes({ openCircuits: () => ["dune:api/server"] }), options);
    monitor.recordRateLimit();
    const snapshot = await monitor.snapshot();
    const line = formatSnapshot(snapshot);
    expect(line).toContain("interactive 8/10 busy, 3 waiting");
    expect(line).toContain("archive buffer=12");
    expect(line).toContain("429s=1");
    expect(line).toContain("open circuits=dune:api/server");
    const warnings = snapshotWarnings({ ...snapshot, eventLoop: { p50Ms: 1, p99Ms: 500, maxMs: 900 } }, 200);
    expect(warnings.join("\n")).toMatch(/DATABASE_POOL_MAX/);
    expect(warnings.join("\n")).toMatch(/Event-loop delay p99 is 500ms/);
    expect(warnings.join("\n")).toMatch(/dune:api\/server/);
  });

  it("writes the health file on each interval and stops cleanly", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arrakis-health-"));
    const healthFile = path.join(directory, "health.json");
    const info = vi.fn();
    const monitor = new RuntimeMonitor(probes(), { intervalMs: 20, healthFile, info, warn: vi.fn() });
    try {
      monitor.start();
      await vi.waitFor(async () => expect(JSON.parse(await readFile(healthFile, "utf8"))).toMatchObject({ ready: true, gateway: { pingMs: 42 } }), { timeout: 2_000 });
      expect(info).toHaveBeenCalled();
    } finally {
      monitor.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
