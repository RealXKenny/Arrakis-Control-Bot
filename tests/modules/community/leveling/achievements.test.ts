import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, eligibleAchievements, highestAchievementPerKind } from "../../../../src/modules/community/leveling/achievements";

describe("community level achievements", () => {
  it("unlocks message, voice, and level milestones from durable profile totals", () => {
    const eligible = eligibleAchievements({
      guildId: "guild",
      userId: "user",
      xp: 625_000,
      messageCount: 2_000,
      voiceMinutes: 1_200,
      lastAwardedAt: new Date(),
      rank: 1,
    });

    expect(eligible).toHaveLength(9);
    expect(highestAchievementPerKind(eligible).map((achievement) => achievement.id)).toEqual([
      "message-king-of-spam-gold",
      "voice-sietch-gold",
      "level-kwisatz-gold",
    ]);
  });

  it("does not unlock a milestone before its threshold", () => {
    const eligible = eligibleAchievements({ guildId: "guild", userId: "user", xp: 6_249, messageCount: 99, voiceMinutes: 59, lastAwardedAt: null, rank: null });
    expect(eligible).toEqual([]);
    expect(ACHIEVEMENTS.map((achievement) => achievement.id)).toHaveLength(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size);
  });
});
