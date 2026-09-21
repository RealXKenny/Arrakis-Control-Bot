import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
import { LevelRepository } from "../../../../src/infrastructure/database/leveling/LevelRepository";

const pool = { query };
const row = {
  guild_id: "guild",
  user_id: "user",
  xp: "105",
  message_count: "7",
  voice_minutes: "3",
  last_awarded_at: "2026-09-20T12:00:00Z",
  rank: "2",
};

describe("LevelRepository", () => {
  beforeEach(() => query.mockReset());

  it("initializes the level table and leaderboard index", async () => {
    query.mockResolvedValue({ rows: [] });
    await new LevelRepository(pool as never).initialize();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toMatch(/CREATE TABLE IF NOT EXISTS community_levels/);
    expect(query.mock.calls[0]?.[0]).toMatch(/community_levels_leaderboard/);
    expect(query.mock.calls[0]?.[0]).toMatch(/voice_minutes/);
    expect(query.mock.calls[0]?.[0]).toMatch(/community_level_events/);
  });

  it("tracks voice minutes with an independent atomic cooldown", async () => {
    query.mockResolvedValue({ rows: [row] });
    const result = await new LevelRepository(pool as never).awardVoiceXp("guild", "user", 60, 55_000);
    expect(query.mock.calls[0]?.[0]).toMatch(/last_voice_awarded_at <=/);
    expect(query.mock.calls[0]?.[1]).toEqual(["guild", "user", 60, 55_000]);
    expect(result).toMatchObject({ xp: 105, voiceMinutes: 3 });
  });

  it("awards XP atomically with rapid-spam and duplicate protection", async () => {
    query.mockResolvedValue({ rows: [row] });
    const result = await new LevelRepository(pool as never).awardMessageXp("guild", "user", 18, 8_000, "fingerprint", 300_000);
    expect(query.mock.calls[0]?.[0]).toMatch(/ON CONFLICT[\s\S]*last_awarded_at <=/);
    expect(query.mock.calls[0]?.[0]).toMatch(/last_message_fingerprint IS DISTINCT FROM/);
    expect(query.mock.calls[0]?.[1]).toEqual(["guild", "user", 18, 8_000, "fingerprint", 300_000]);
    expect(result).toMatchObject({ xp: 105, messageCount: 7, lastAwardedAt: new Date("2026-09-20T12:00:00Z") });
  });

  it("returns null during cooldown and an unranked zero profile for new members", async () => {
    query.mockResolvedValue({ rows: [] });
    const repository = new LevelRepository(pool as never);
    await expect(repository.awardMessageXp("guild", "user", 18, 8_000, "fingerprint", 300_000)).resolves.toBeNull();
    await expect(repository.profile("guild", "new-user")).resolves.toMatchObject({ xp: 0, messageCount: 0, rank: null });
  });

  it("maps ranked leaderboard rows", async () => {
    query.mockResolvedValue({ rows: [row] });
    await expect(new LevelRepository(pool as never).leaderboard("guild", 10)).resolves.toEqual([
      expect.objectContaining({ userId: "user", xp: 105, rank: 2 }),
    ]);
    expect(query.mock.calls[0]?.[1]).toEqual(["guild", 10]);
  });

  it("persists, reads, and stops a double-XP event", async () => {
    const eventRow = { guild_id: "guild", starts_at: "2026-09-20T18:00:00Z", ends_at: "2026-09-20T20:00:00Z", created_by: "admin" };
    query.mockResolvedValueOnce({ rows: [eventRow] }).mockResolvedValueOnce({ rows: [eventRow] }).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const repository = new LevelRepository(pool as never);
    await expect(repository.scheduleEvent("guild", new Date(eventRow.starts_at), new Date(eventRow.ends_at), "admin")).resolves.toMatchObject({ guildId: "guild", createdBy: "admin" });
    await expect(repository.upcomingEvent("guild")).resolves.toMatchObject({ endsAt: new Date(eventRow.ends_at) });
    await expect(repository.stopEvent("guild")).resolves.toBe(true);
  });
});
