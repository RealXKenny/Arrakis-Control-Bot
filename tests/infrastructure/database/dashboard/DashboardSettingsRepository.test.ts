import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DashboardSettingsRepository } from "../../../../src/infrastructure/database/dashboard/DashboardSettingsRepository";

const guild = "123456789012345678";
const user = "223456789012345678";
function setup() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, repository: new DashboardSettingsRepository({ query } as unknown as Pool) };
}

describe("dashboard settings repository", () => {
  it("stores framework keys as parameterized JSON per guild and returns null when unset", async () => {
    const { query, repository } = setup();
    await repository.set(`${guild}:general.welcome`, { text: "hi" });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("ON CONFLICT (guild_id, setting_key)"), [guild, "general.welcome", "{\"text\":\"hi\"}"]);
    expect(await repository.get(`${guild}:general.welcome`)).toBeNull();
    query.mockResolvedValueOnce({ rows: [{ value: false }] });
    expect(await repository.get(`${guild}:general.welcome`)).toBe(false);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("CREATE TABLE"))).toHaveLength(1);
  });

  it("rejects malformed keys and oversized values before querying", async () => {
    const { query, repository } = setup();
    await expect(repository.get("bad")).rejects.toThrow("Invalid dashboard setting key");
    await expect(repository.set(`${guild}:general.welcome'--`, 1)).rejects.toThrow("Invalid dashboard setting key");
    await expect(repository.set(`${guild}:general.welcome`, "x".repeat(20_000))).rejects.toThrow("too large");
    expect(query).not.toHaveBeenCalled();
  });

  it("records and lists durable audit history newest first", async () => {
    const { query, repository } = setup();
    await repository.record({ spaceId: guild, userId: user, key: "general.welcome", value: "hi" });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO bot_dashboard_audit"), [guild, user, "general.welcome", "\"hi\""]);
    const at = new Date("2026-11-26T00:00:00Z");
    query.mockResolvedValueOnce({ rows: [{ user_id: user, setting_key: "general.welcome", value: "hi", created_at: at }] });
    expect(await repository.list(guild)).toEqual([{ spaceId: guild, userId: user, key: "general.welcome", value: "hi", at: at.getTime() }]);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("ORDER BY created_at DESC"), [guild, 50]);
    query.mockResolvedValueOnce({ rows: [{ user_id: 1, setting_key: "x", value: null, created_at: at }] });
    await expect(repository.list(guild)).rejects.toThrow("Invalid stored dashboard audit entry");
    await expect(repository.record({ spaceId: guild, userId: "bad", key: "general.welcome", value: 1 })).rejects.toThrow();
  });

  it("purges audit history past the retention window", async () => {
    const { query, repository } = setup();
    await repository.purgeExpired();
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("DELETE FROM bot_dashboard_audit WHERE created_at <= NOW() - INTERVAL '365 days'"));
  });
});
