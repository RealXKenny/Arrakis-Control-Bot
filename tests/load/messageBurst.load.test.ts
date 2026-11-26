/**
 * Load and soak budgets for the single-guild hot path, against mocked PostgreSQL pools
 * with realistic latency. The default run is short enough for every CI test job;
 * `npm run test:load` (Vitest mode `soak`) runs a longer soak.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { MessageArchiveRepository, type MessageArchiveInput } from "../../src/infrastructure/database/messages/MessageArchiveRepository";

const SOAK = process.env.LOAD_SOAK === "1";
const MESSAGES_PER_SECOND = 2_000;
const SECONDS = SOAK ? 30 : 3;
const QUERY_LATENCY_MS = 8;

// Budgets: what a busy hour must not exceed.
const BUDGET = {
  interactionP99Ms: 50,
  eventLoopP99Ms: 100,
  maxBufferedFraction: 0.5,
};

/** A pool that serves `size` queries at once, each taking `latencyMs`, and queues the rest. */
function simulatedPool(size: number, latencyMs: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  let queries = 0;
  const acquire = () => (active < size ? (active++, Promise.resolve()) : new Promise<void>((resolve) => waiting.push(resolve)));
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return {
    get queries() { return queries; },
    async query(): Promise<{ rows: unknown[]; rowCount: number }> {
      await acquire();
      queries++;
      try {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
        return { rows: [], rowCount: 0 };
      } finally {
        release();
      }
    },
  };
}

function message(index: number): MessageArchiveInput {
  return {
    messageId: String(100_000_000_000_000_000n + BigInt(index)),
    guildId: "100000000000000001",
    channelId: `10000000000000${String(index % 50).padStart(4, "0")}`,
    authorId: `20000000000000${String(index % 400).padStart(4, "0")}`,
    authorTag: "member",
    content: "the spice must flow ".repeat(5),
    metadata: { attachments: [], embeds: [], components: [], stickers: [], reference: null },
    messageType: 0,
    flags: "0",
    isBot: false,
    webhookId: null,
    createdAt: new Date(),
    editedAt: null,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

describe(`message burst (${MESSAGES_PER_SECOND}/s for ${SECONDS}s)`, () => {
  it("keeps interaction queries fast while the archive absorbs the burst", async () => {
    const background = simulatedPool(5, QUERY_LATENCY_MS);
    const interactive = simulatedPool(10, QUERY_LATENCY_MS);
    const archive = new MessageArchiveRepository(background as never, { batchSize: 200, maxBuffered: 10_000, flushIntervalMs: 250 });
    archive.start(() => undefined);
    const loop = monitorEventLoopDelay({ resolution: 10 });
    loop.enable();

    const interactionLatencies: number[] = [];
    let maxBuffered = 0;
    let sent = 0;
    const tickMs = 50;
    const perTick = (MESSAGES_PER_SECOND * tickMs) / 1_000;

    for (let tick = 0; tick < (SECONDS * 1_000) / tickMs; tick++) {
      for (let index = 0; index < perTick; index++) archive.enqueue(message(sent++));
      maxBuffered = Math.max(maxBuffered, archive.bufferedCount);
      // One slash command every tick, like a busy channel.
      const startedAt = performance.now();
      void interactive.query().then(() => interactionLatencies.push(performance.now() - startedAt));
      await new Promise((resolve) => setTimeout(resolve, tickMs));
    }
    await archive.stop();
    loop.disable();

    const eventLoopP99Ms = loop.percentile(99) / 1e6;
    expect(archive.takeDroppedCount()).toBe(0);
    expect(archive.bufferedCount).toBe(0);
    expect(background.queries).toBeLessThanOrEqual(Math.ceil(sent / 200) + (SECONDS * 1_000) / 250 + 5);
    expect(maxBuffered).toBeLessThan(10_000 * BUDGET.maxBufferedFraction);
    expect(percentile(interactionLatencies, 99)).toBeLessThan(BUDGET.interactionP99Ms);
    expect(eventLoopP99Ms).toBeLessThan(BUDGET.eventLoopP99Ms);
  }, (SECONDS + 30) * 1_000);

  it("drops, counts and recovers instead of growing memory when PostgreSQL stalls", async () => {
    let stalled = true;
    const pool = { query: () => (stalled ? Promise.reject(new Error("connection timeout")) : Promise.resolve({ rows: [], rowCount: 0 })) };
    const archive = new MessageArchiveRepository(pool as never, { batchSize: 200, maxBuffered: 1_000, flushIntervalMs: 50 });
    for (let index = 0; index < 5_000; index++) archive.enqueue(message(index));
    await archive.flush().catch(() => undefined);
    expect(archive.bufferedCount).toBeLessThanOrEqual(1_000);
    expect(archive.takeDroppedCount()).toBeGreaterThan(0);
    stalled = false;
    await archive.flush();
    expect(archive.bufferedCount).toBe(0);
  });
});
