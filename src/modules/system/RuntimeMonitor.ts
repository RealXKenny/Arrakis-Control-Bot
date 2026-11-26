import { monitorEventLoopDelay } from "node:perf_hooks";
import { rename, writeFile } from "node:fs/promises";

import type { PoolStats } from "../../infrastructure/database/tickets/TicketRepository";

/** Everything the monitor reads from the running bot, supplied by the composition root. */
interface RuntimeProbes {
  gatewayReady(): boolean;
  gatewayPingMs(): number | null;
  /** Resolves when PostgreSQL answers; undefined when the bot runs without a database. */
  databasePing?: () => Promise<void>;
  poolStats?: () => { interactive: PoolStats; background: PoolStats };
  archiveBuffered?: () => number;
  openCircuits?: () => string[];
  cachedMessages?: () => number;
}

interface RuntimeSnapshot {
  at: string;
  ready: boolean;
  gateway: { ready: boolean; pingMs: number | null };
  database: { configured: boolean; healthy: boolean | null; pools: { interactive: PoolStats; background: PoolStats } | null };
  eventLoop: { p50Ms: number; p99Ms: number; maxMs: number };
  memory: { rssMb: number; heapUsedMb: number };
  archiveBuffered: number | null;
  openCircuits: string[];
  restRateLimits: number;
  cachedMessages: number | null;
}

interface RuntimeMonitorOptions {
  intervalMs: number;
  /** Optional file rewritten each interval for container or panel health checks. */
  healthFile?: string;
  info(message: string): void;
  warn(message: string): void;
  /** Event-loop p99 above this is reported as a warning. */
  eventLoopWarnMs?: number;
  /**
   * Quiet samples are printed at most this often (default five minutes). A sample with warnings,
   * rate limits or a changed health state is printed at once. The health file is still rewritten every interval.
   */
  summaryIntervalMs?: number;
}

const DATABASE_PING_TIMEOUT_MS = 2_000;
const DEFAULT_SUMMARY_INTERVAL_MS = 300_000;

/**
 * Samples runtime health without opening a network port: event-loop delay, memory,
 * gateway state, database reachability and pool pressure, archive buffer depth,
 * open upstream circuits and Discord REST rate limits.
 */
class RuntimeMonitor {
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private timer?: ReturnType<typeof setInterval>;
  private restRateLimits = 0;
  private databaseHealthy: boolean | null = null;
  private lastLoggedAt: number | null = null;
  private lastHealthState: string | null = null;

  public constructor(private readonly probes: RuntimeProbes, private readonly options: RuntimeMonitorOptions) {}

  public start(): void {
    if (this.timer || this.options.intervalMs <= 0) return;
    this.histogram.enable();
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.histogram.disable();
  }

  /** Call from the REST client's rateLimited event. */
  public recordRateLimit(): void {
    this.restRateLimits += 1;
  }

  /** Call when a pooled connection fails, so the next snapshot shows the outage at once. */
  public recordDatabaseError(): void {
    this.databaseHealthy = false;
  }

  public async snapshot(now = new Date()): Promise<RuntimeSnapshot> {
    const { probes } = this;
    if (probes.databasePing) {
      this.databaseHealthy = await pingWithin(probes.databasePing, DATABASE_PING_TIMEOUT_MS);
    }
    const memory = process.memoryUsage();
    const toMs = (nanoseconds: number): number => Math.round(nanoseconds / 1e6);
    const gatewayReady = probes.gatewayReady();
    const databaseConfigured = Boolean(probes.databasePing);
    const snapshot: RuntimeSnapshot = {
      at: now.toISOString(),
      ready: gatewayReady && (!databaseConfigured || this.databaseHealthy === true),
      gateway: { ready: gatewayReady, pingMs: probes.gatewayPingMs() },
      database: { configured: databaseConfigured, healthy: this.databaseHealthy, pools: probes.poolStats?.() ?? null },
      eventLoop: {
        p50Ms: toMs(this.histogram.percentile(50) || 0),
        p99Ms: toMs(this.histogram.percentile(99) || 0),
        maxMs: toMs(this.histogram.max || 0),
      },
      memory: { rssMb: Math.round(memory.rss / 1_048_576), heapUsedMb: Math.round(memory.heapUsed / 1_048_576) },
      archiveBuffered: probes.archiveBuffered?.() ?? null,
      openCircuits: probes.openCircuits?.() ?? [],
      restRateLimits: this.restRateLimits,
      cachedMessages: probes.cachedMessages?.() ?? null,
    };
    return snapshot;
  }

  private async tick(): Promise<void> {
    try {
      const snapshot = await this.snapshot();
      this.histogram.reset();
      this.restRateLimits = 0;
      const warnings = snapshotWarnings(snapshot, this.options.eventLoopWarnMs ?? 200);
      if (this.shouldLog(snapshot, warnings.length > 0)) this.options.info(formatSnapshot(snapshot));
      for (const warning of warnings) this.options.warn(warning);
      if (this.options.healthFile) await writeHealthFile(this.options.healthFile, snapshot);
    } catch (error) {
      this.options.warn(`Runtime metrics sample failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Decides whether a sample is worth a console line; quiet, unchanged samples wait for the summary interval. */
  public shouldLog(snapshot: RuntimeSnapshot, hasWarnings: boolean): boolean {
    // Dev note: A metrics line that says "still fine" sixty times an hour is the log's version of "are we there yet?".
    const now = Date.parse(snapshot.at);
    const state = healthState(snapshot);
    const summaryIntervalMs = Math.max(this.options.summaryIntervalMs ?? DEFAULT_SUMMARY_INTERVAL_MS, this.options.intervalMs);
    const due = this.lastLoggedAt === null || now - this.lastLoggedAt >= summaryIntervalMs;
    const changed = this.lastHealthState !== null && state !== this.lastHealthState;
    this.lastHealthState = state;
    if (!due && !changed && !hasWarnings && snapshot.restRateLimits === 0) return false;
    this.lastLoggedAt = now;
    return true;
  }
}

/** The parts of a snapshot whose change is news on its own; ping, memory and buffers drift every sample. */
function healthState(snapshot: RuntimeSnapshot): string {
  return [snapshot.ready, snapshot.gateway.ready, snapshot.database.healthy, snapshot.openCircuits.join(",")].join("|");
}

async function pingWithin(ping: () => Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
  try {
    return await Promise.race([ping().then(() => true, () => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function formatSnapshot(snapshot: RuntimeSnapshot): string {
  const pools = snapshot.database.pools;
  const pool = (stats: PoolStats): string => `${stats.total - stats.idle}/${stats.total} busy, ${stats.waiting} waiting`;
  return [
    `ready=${snapshot.ready ? "yes" : "no"}`,
    `ping=${snapshot.gateway.pingMs ?? "n/a"}ms`,
    `loop p99=${snapshot.eventLoop.p99Ms}ms max=${snapshot.eventLoop.maxMs}ms`,
    `heap=${snapshot.memory.heapUsedMb}MB rss=${snapshot.memory.rssMb}MB`,
    snapshot.database.configured ? `db=${snapshot.database.healthy ? "up" : "down"}${pools ? ` (interactive ${pool(pools.interactive)}; background ${pool(pools.background)})` : ""}` : "db=off",
    snapshot.archiveBuffered === null ? null : `archive buffer=${snapshot.archiveBuffered}`,
    snapshot.cachedMessages === null ? null : `cached messages=${snapshot.cachedMessages}`,
    `429s=${snapshot.restRateLimits}`,
    snapshot.openCircuits.length ? `open circuits=${snapshot.openCircuits.join(",")}` : null,
  ].filter(Boolean).join(" | ");
}

function snapshotWarnings(snapshot: RuntimeSnapshot, eventLoopWarnMs: number): string[] {
  const warnings: string[] = [];
  if (!snapshot.gateway.ready) warnings.push("Discord gateway is not ready.");
  if (snapshot.database.configured && !snapshot.database.healthy) warnings.push("PostgreSQL is not answering; persistence features will fail until it returns.");
  if (snapshot.eventLoop.p99Ms > eventLoopWarnMs) warnings.push(`Event-loop delay p99 is ${snapshot.eventLoop.p99Ms}ms; interactions may miss Discord's 3-second window.`);
  const pools = snapshot.database.pools;
  if (pools && pools.interactive.waiting > 0) warnings.push(`${pools.interactive.waiting} interactive database queries are waiting for a connection; consider raising DATABASE_POOL_MAX.`);
  if (snapshot.openCircuits.length) warnings.push(`Upstream circuits are open: ${snapshot.openCircuits.join(", ")}.`);
  return warnings;
}

/** Write then rename, so a reader never sees a half-written file. */
async function writeHealthFile(path: string, snapshot: RuntimeSnapshot): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, "utf8");
  await rename(temporary, path);
}

export { formatSnapshot, RuntimeMonitor, snapshotWarnings };
export type { RuntimeProbes, RuntimeSnapshot };
