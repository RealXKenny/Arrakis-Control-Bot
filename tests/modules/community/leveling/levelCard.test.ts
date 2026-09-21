import type { User } from "discord.js";
import { describe, expect, it } from "vitest";
import { LEVEL_LEADERBOARD_FILENAME, createLevelLeaderboardCard } from "../../../../src/modules/community/leveling/leaderboardCard";
import { LEVEL_CARD_FILENAME, createLevelRankCard } from "../../../../src/modules/community/leveling/levelCard";
import { ACHIEVEMENTS } from "../../../../src/modules/community/leveling/achievements";
import { ACHIEVEMENT_CARD_FILENAMES, LEVEL_UP_CARD_FILENAME, createAchievementCard, createLevelUpCard } from "../../../../src/modules/community/leveling/announcementCards";

describe("community level image card", () => {
  it("renders a bounded PNG and falls back safely when the avatar is unavailable", async () => {
    const user = { displayAvatarURL: () => "invalid-avatar" } as unknown as User;
    const card = await createLevelRankCard({
      user,
      displayName: "Paul Atreides",
      profile: { guildId: "guild", userId: "user", xp: 2_735, messageCount: 182, voiceMinutes: 64, lastAwardedAt: new Date(), rank: 3 },
    });
    const image = card.attachment;

    expect(card.name).toBe(LEVEL_CARD_FILENAME);
    expect(Buffer.isBuffer(image)).toBe(true);
    expect((image as Buffer).subarray(1, 4).toString()).toBe("PNG");
    expect((image as Buffer).byteLength).toBeLessThan(10 * 1024 * 1024);
  });

  it("renders a themed leaderboard image with avatar fallbacks", async () => {
    const card = await createLevelLeaderboardCard(Array.from({ length: 10 }, (_, index) => ({
      user: { displayAvatarURL: () => "invalid-avatar" } as unknown as User,
      displayName: `Traveler ${index + 1}`,
      profile: {
        guildId: "guild",
        userId: String(index + 1),
        xp: (10 - index) * 10_000,
        messageCount: 100 - index,
        voiceMinutes: index,
        lastAwardedAt: new Date(),
        rank: index + 1,
      },
    })));
    const image = card.attachment;

    expect(card.name).toBe(LEVEL_LEADERBOARD_FILENAME);
    expect(Buffer.isBuffer(image)).toBe(true);
    expect((image as Buffer).subarray(1, 4).toString()).toBe("PNG");
    expect((image as Buffer).byteLength).toBeLessThan(10 * 1024 * 1024);
  });

  it("renders a dedicated level-up image and a distinct image for every achievement type", async () => {
    const user = { username: "Paul", displayAvatarURL: () => "invalid-avatar" } as unknown as User;
    const profile = { guildId: "guild", userId: "user", xp: 6_250, messageCount: 100, voiceMinutes: 60, lastAwardedAt: new Date(), rank: 1 };
    const levelUp = await createLevelUpCard({ user, displayName: "Paul Atreides", profile, level: 5 });
    expect(levelUp.name).toBe(LEVEL_UP_CARD_FILENAME);

    for (const kind of ["message", "voice", "level"] as const) {
      const achievement = ACHIEVEMENTS.find((candidate) => candidate.kind === kind)!;
      const card = await createAchievementCard({ user, displayName: "Paul Atreides", achievement });
      expect(card.name).toBe(ACHIEVEMENT_CARD_FILENAMES[kind]);
      expect(Buffer.isBuffer(card.attachment)).toBe(true);
      expect((card.attachment as Buffer).subarray(1, 4).toString()).toBe("PNG");
    }
  });
});
