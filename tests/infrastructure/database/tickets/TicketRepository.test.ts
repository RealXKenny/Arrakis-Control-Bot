import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn(), Pool: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class MockPool {
    query = mocks.query;
    end = mocks.end;

    constructor(config: unknown) {
      mocks.Pool(config);
    }
  },
}));

import { TicketRepository } from "../../../../src/infrastructure/database/tickets/TicketRepository";

const row = {
  id: "42", guild_id: "guild", channel_id: "channel", ticket_message_id: "message", opener_id: "opener",
  subject: "Help", category: "Technical", description: "Broken", steps_tried: "Restarted", impact: "Blocked",
  dune_lookup_status: "linked", dune_linked: true, dune_character_name: "Paul", dune_pawn_id: "pawn",
  dune_controller_id: "controller", dune_online_status: "online", status: "open", created_at: "2026-09-14T12:00:00Z",
  closed_at: null, closed_by: null, claimed_by: null, claimed_at: null, transcript: null,
  transcript_created_at: null, transcript_message_count: 0, review_rating: null, review_resolved: null,
  review_comment: null, reviewed_at: null, archive_channel_id: null, archive_message_id: null,
};

describe("TicketRepository", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.end.mockReset();
    mocks.Pool.mockClear();
  });

  it("configures a bounded PostgreSQL pool with optional TLS", () => {
    new TicketRepository("postgres://db", true);
    expect(mocks.Pool).toHaveBeenCalledWith(expect.objectContaining({ connectionString: "postgres://db", max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: false } }));
  });

  it("initializes the schema, indexes, and stale reservation cleanup", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await new TicketRepository("postgres://db").initialize();
    expect(mocks.query).toHaveBeenCalledTimes(5);
    const sql = mocks.query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS tickets/);
    expect(sql).toMatch(/tickets_one_active_per_member/);
    expect(sql).toMatch(/INTERVAL '10 minutes'/);
  });

  it("reserves a ticket using parameterized SQL and maps database values", async () => {
    mocks.query.mockResolvedValue({ rows: [row] });
    const repository = new TicketRepository("postgres://db");
    const result = await repository.reserve("guild", "opener", { subject: "Help", category: "Technical", description: "Broken", stepsTried: "Restarted", impact: "Blocked" }, "linked", { characterName: "Paul", pawnId: "pawn", controllerId: "controller", onlineStatus: "online" });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["guild", "opener", "Help", "Technical", "Broken", "Restarted", "Blocked", "linked", true, "Paul", "pawn", "controller", "online"]);
    expect(result).toMatchObject({ id: 42, guildId: "guild", duneAccount: { characterName: "Paul" }, createdAt: new Date("2026-09-14T12:00:00Z") });
  });

  it("validates reviews before touching the database", async () => {
    const repository = new TicketRepository("postgres://db");
    await expect(repository.submitReview(1, "user", { rating: 0, resolved: false, comment: "" })).rejects.toThrow("integers from 1 to 5");
    await expect(repository.submitReview(1, "user", { rating: 5, resolved: true, comment: "x".repeat(2_001) })).rejects.toThrow("2,000 characters or fewer");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("throws when state-sensitive updates affect no ticket and closes the pool", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const repository = new TicketRepository("postgres://db");
    await expect(repository.activate(7, "channel", "message")).rejects.toThrow("Ticket 7 could not be activated");
    await expect(repository.updateTranscript(7, "transcript", 2)).rejects.toThrow("Ticket 7 transcript could not be finalized");
    await repository.close();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
