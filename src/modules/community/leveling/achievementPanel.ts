import { ContainerBuilder, escapeMarkdown } from "discord.js";
import type { LevelProfile } from "../../../infrastructure/database/leveling/LevelRepository";
import { ACHIEVEMENTS, type AchievementKind, type LevelAchievement } from "./achievements";
import { levelForXp } from "./levelProgress";

const CATEGORIES: readonly { kind: AchievementKind; title: string; unit: string }[] = [
  { kind: "message", title: "King of Spam", unit: "rewarded messages" },
  { kind: "voice", title: "Voice of the Sietch", unit: "rewarded voice minutes" },
  { kind: "level", title: "Path of the Kwisatz", unit: "community level" },
];

function achievementPanel(displayName: string, profile: LevelProfile, unlockedIds: readonly string[]): ContainerBuilder {
  const unlocked = new Set(unlockedIds);
  const values: Record<AchievementKind, number> = {
    message: profile.messageCount,
    voice: profile.voiceMinutes,
    level: levelForXp(profile.xp),
  };
  const name = escapeMarkdown(displayName.replace(/[\r\n]/g, " ").trim().slice(0, 80) || "Traveler");
  const card = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addTextDisplayComponents((text) => text.setContent(`## 🏆 ${name}'s Achievements`))
    .addTextDisplayComponents((text) => text.setContent(`${ACHIEVEMENTS.filter((achievement) => unlocked.has(achievement.id)).length} of ${ACHIEVEMENTS.length} unlocked`));

  for (const category of CATEGORIES) {
    const rows = ACHIEVEMENTS.filter((achievement) => achievement.kind === category.kind)
      .map((achievement) => achievementRow(achievement, values[category.kind], category.unit, unlocked.has(achievement.id)));
    card.addTextDisplayComponents((text) => text.setContent(`### ${category.title}\n${rows.join("\n")}`));
  }

  return card.addTextDisplayComponents((text) => text.setContent("-# Progress updates from rewarded activity. Unlocks are recorded when XP is awarded."));
}

function achievementRow(achievement: LevelAchievement, value: number, unit: string, unlocked: boolean): string {
  const progress = `${Math.min(value, achievement.threshold).toLocaleString()} / ${achievement.threshold.toLocaleString()} ${unit}`;
  return `${unlocked ? "✅" : "▫️"} **${achievement.tier}** · ${progress}${unlocked ? " · Unlocked" : ""}`;
}

export { achievementPanel };
