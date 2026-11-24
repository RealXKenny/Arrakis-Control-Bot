import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DashboardOAuthRepository } from "../../../../src/infrastructure/database/dashboard/DashboardOAuthRepository";

describe("dashboard OAuth transactions", () => {
  it("stores a hashed state and atomically consumes unexpired transactions", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new DashboardOAuthRepository({ query } as unknown as Pool);
    const state = "a".repeat(43);
    const verifier = "b".repeat(43);
    const hash = createHash("sha256").update(state).digest("hex");
    await repository.create(state, verifier);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO"), [hash, verifier, 600]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(state);
    query.mockResolvedValueOnce({ rows: [{ verifier }] });
    expect(await repository.consume(state)).toBe(verifier);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("DELETE FROM bot_dashboard_oauth_transactions WHERE state_hash = $1 AND expires_at > NOW() RETURNING verifier"), [hash]);
    expect(await repository.consume(state)).toBeNull();
  });

  it("rejects malformed values without querying the database", async () => {
    const query = vi.fn();
    const repository = new DashboardOAuthRepository({ query } as unknown as Pool);
    await expect(repository.create("invalid", "invalid")).rejects.toThrow("Invalid OAuth transaction");
    expect(await repository.consume("invalid")).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
