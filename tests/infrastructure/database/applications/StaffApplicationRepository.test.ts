import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApplicationRepository } from "../../../../src/infrastructure/database/applications/StaffApplicationRepository";

const query = vi.fn();
const pool = { query };
const row = {
  id: "00000000-0000-4000-8000-000000000001",
  guild_id: "guild",
  user_id: "user",
  answers: { identity: "UTC", experience: "Mod", motivation: "Help", scenario: "Calm", availability: "Evenings" },
  status: "pending",
  review_channel_id: null,
  review_message_id: null,
  reviewer_id: null,
  review_reason: null,
  created_at: "2026-09-20T12:00:00Z",
  decided_at: null,
};

describe("StaffApplicationRepository", () => {
  beforeEach(() => query.mockReset());

  it("initializes the table and one-pending-per-member index", async () => {
    query.mockResolvedValue({ rows: [] });
    await new StaffApplicationRepository(pool as never).initialize();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain("WHERE status = 'pending'");
  });

  it("creates and maps an application without losing its timestamp", async () => {
    query.mockResolvedValue({ rows: [row] });
    const result = await new StaffApplicationRepository(pool as never).create(row.id, "guild", "user", row.answers);
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT DO NOTHING");
    expect(result).toMatchObject({ id: row.id, status: "pending", createdAt: new Date(row.created_at) });
  });

  it("allows only the first pending decision to win", async () => {
    query.mockResolvedValue({ rows: [{ ...row, status: "accepted", reviewer_id: "staff", review_reason: "Great", decided_at: "2026-09-20T13:00:00Z" }] });
    const result = await new StaffApplicationRepository(pool as never).decide(row.id, "accepted", "staff", "Great");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE id = $1 AND status = 'pending'");
    expect(result).toMatchObject({ status: "accepted", reviewerId: "staff", reviewReason: "Great" });
  });
});
