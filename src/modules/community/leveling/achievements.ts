import type { LevelProfile } from "../../../infrastructure/database/leveling/LevelRepository";
import { levelForXp } from "./levelProgress";

type AchievementKind = "level" | "message" | "voice";
type AchievementTier = "Bronze" | "Silver" | "Gold";

interface LevelAchievement {
  id: string;
  kind: AchievementKind;
  name: string;
  tier: AchievementTier;
  threshold: number;
  description: string;
}

const ACHIEVEMENTS: readonly LevelAchievement[] = [
  { id: "message-king-of-spam-bronze", kind: "message", name: "King of Spam", tier: "Bronze", threshold: 100, description: "100 rewarded messages crossed the dunes." },
  { id: "message-king-of-spam-silver", kind: "message", name: "King of Spam", tier: "Silver", threshold: 500, description: "500 rewarded messages carried through the sietch." },
  { id: "message-king-of-spam-gold", kind: "message", name: "King of Spam", tier: "Gold", threshold: 2_000, description: "2,000 rewarded messages made the desert echo." },
  { id: "voice-sietch-bronze", kind: "voice", name: "Voice of the Sietch", tier: "Bronze", threshold: 60, description: "One rewarded hour spent in voice." },
  { id: "voice-sietch-silver", kind: "voice", name: "Voice of the Sietch", tier: "Silver", threshold: 300, description: "Five rewarded hours spent in voice." },
  { id: "voice-sietch-gold", kind: "voice", name: "Voice of the Sietch", tier: "Gold", threshold: 1_200, description: "Twenty rewarded hours spent in voice." },
  { id: "level-kwisatz-bronze", kind: "level", name: "Path of the Kwisatz", tier: "Bronze", threshold: 5, description: "Reached community level 5." },
  { id: "level-kwisatz-silver", kind: "level", name: "Path of the Kwisatz", tier: "Silver", threshold: 25, description: "Reached community level 25." },
  { id: "level-kwisatz-gold", kind: "level", name: "Path of the Kwisatz", tier: "Gold", threshold: 50, description: "Reached community level 50." },
] as const;

function eligibleAchievements(profile: LevelProfile): LevelAchievement[] {
  const values: Record<AchievementKind, number> = {
    level: levelForXp(profile.xp),
    message: profile.messageCount,
    voice: profile.voiceMinutes,
  };
  return ACHIEVEMENTS.filter((achievement) => values[achievement.kind] >= achievement.threshold);
}

function achievementsByIds(ids: readonly string[]): LevelAchievement[] {
  const claimed = new Set(ids);
  return ACHIEVEMENTS.filter((achievement) => claimed.has(achievement.id));
}

function highestAchievementPerKind(achievements: readonly LevelAchievement[]): LevelAchievement[] {
  const highest = new Map<AchievementKind, LevelAchievement>();
  for (const achievement of achievements) {
    const current = highest.get(achievement.kind);
    if (!current || achievement.threshold > current.threshold) highest.set(achievement.kind, achievement);
  }
  return [...highest.values()];
}

function achievementProgressLabel(achievement: LevelAchievement): string {
  if (achievement.kind === "message") return `${achievement.threshold.toLocaleString()} REWARDED MESSAGES`;
  if (achievement.kind === "voice") return `${achievement.threshold.toLocaleString()} REWARDED VOICE MINUTES`;
  return `COMMUNITY LEVEL ${achievement.threshold}`;
}

export { ACHIEVEMENTS, achievementProgressLabel, achievementsByIds, eligibleAchievements, highestAchievementPerKind };
export type { AchievementKind, AchievementTier, LevelAchievement };
