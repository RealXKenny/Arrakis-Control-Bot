import { createHmac } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DashboardRateLimitRepository } from "../../../../src/infrastructure/database/dashboard/DashboardRateLimitRepository";

const secret = "s".repeat(32);
function setup() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, limiter: new DashboardRateLimitRepository({ query } as unknown as Pool, secret) };
}

describe("dashboard shared rate limits", () => {
  it("uses atomic database windows and stores an HMAC rather than the address", async () => {
    const { query, limiter } = setup();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ hits: 1 }] }).mockResolvedValueOnce({ rows: [{ hits: 3 }] });
    const hash = createHmac("sha256", secret).update("192.0.2.1").digest("hex");
    expect(await limiter.consume("oauth", "192.0.2.1", 2, 60)).toBe(true);
    expect(await limiter.consume("oauth", "192.0.2.1", 2, 60)).toBe(false);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("ON CONFLICT (scope, subject_hash) DO UPDATE"), ["oauth", hash, 60, 2]);
    expect(JSON.stringify(query.mock.calls)).not.toContain("192.0.2.1");
  });

  it("rejects invalid limits and fails closed on corrupt or unavailable storage", async () => {
    expect(() => new DashboardRateLimitRepository({} as Pool, "short")).toThrow();
    const { query, limiter } = setup();
    await expect(limiter.consume("oauth", "", 1, 60)).rejects.toThrow("Invalid dashboard rate limit");
    await expect(limiter.consume("other" as "oauth", "subject", 1, 60)).rejects.toThrow("Invalid dashboard rate limit");
    expect(query).not.toHaveBeenCalled();
    query.mockRejectedValueOnce(new Error("offline"));
    await expect(limiter.consume("oauth", "subject", 1, 60)).rejects.toThrow("offline");
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ hits: "invalid" }] });
    await expect(limiter.consume("oauth", "subject", 1, 60)).rejects.toThrow("Invalid dashboard rate-limit result");
  });
});
