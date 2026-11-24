import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DashboardSessionRepository } from "../../../../src/infrastructure/database/dashboard/DashboardSessionRepository";

const userId = "123456789012345678";
function setup() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, repository: new DashboardSessionRepository({ query } as unknown as Pool) };
}

describe("dashboard sessions", () => {
  it("stores only a random token hash and uses the database clock for expiration", async () => {
    const { query, repository } = setup();
    const token = await repository.create(userId, 3600);
    const hash = createHash("sha256").update(token).digest("hex");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("NOW() + $3"), [hash, userId, 3600]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(token);
    query.mockResolvedValueOnce({ rows: [{ user_id: userId }] });
    expect(await repository.getUserId(token)).toBe(userId);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("expires_at > NOW()"), [hash]);
    await repository.revoke(token);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("DELETE FROM bot_dashboard_sessions WHERE token_hash"), [hash]);
  });

  it("rejects invalid lifetimes and tokens without database access", async () => {
    const { repository, query } = setup();
    await expect(repository.create(userId, 604_801)).rejects.toThrow("Invalid dashboard session");
    expect(await repository.getUserId("bad")).toBeNull();
    await repository.revoke("bad");
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed on corrupt data and retries initialization after a failure", async () => {
    const { repository, query } = setup();
    query.mockRejectedValueOnce(new Error("offline"));
    await expect(repository.create(userId, 60)).rejects.toThrow("offline");
    const token = await repository.create(userId, 60);
    query.mockResolvedValueOnce({ rows: [{ user_id: "bad" }] });
    await expect(repository.getUserId(token)).rejects.toThrow("Invalid stored dashboard session");
    await repository.purgeExpired();
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("expires_at <= NOW()"));
  });
});
