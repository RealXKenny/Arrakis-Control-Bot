import path from "node:path";
import { AttachmentBuilder, type User } from "discord.js";
import { createCanvas, loadImage, type CanvasRenderingContext2D, type Image } from "canvas";
import type { LevelProfile } from "../../../infrastructure/database/leveling/LevelRepository";
import { canvasDisplayName } from "../../../shared/discord/canvasText";
import { achievementProgressLabel, type AchievementKind, type LevelAchievement } from "./achievements";

const LEVEL_UP_CARD_FILENAME = "arrakis-level-up.png";
const ACHIEVEMENT_CARD_FILENAMES: Readonly<Record<AchievementKind, string>> = {
  message: "arrakis-achievement-message.png",
  voice: "arrakis-achievement-voice.png",
  level: "arrakis-achievement-level.png",
};
const LEVEL_UP_BACKGROUND = path.resolve(process.cwd(), "data", "images", "level-up-banner.png");
const ACHIEVEMENT_BACKGROUNDS: Readonly<Record<AchievementKind, string>> = {
  message: path.resolve(process.cwd(), "data", "images", "achievement-message-banner.png"),
  voice: path.resolve(process.cwd(), "data", "images", "achievement-voice-banner.png"),
  level: path.resolve(process.cwd(), "data", "images", "achievement-level-banner.png"),
};
const WIDTH = 1_200;
const HEIGHT = 400;
const backgroundPromises = new Map<string, Promise<Image>>();

interface AnnouncementBase {
  user: User;
  displayName: string;
}

interface LevelUpCardOptions extends AnnouncementBase {
  level: number;
  profile: LevelProfile;
}

interface AchievementCardOptions extends AnnouncementBase {
  achievement: LevelAchievement;
}

async function createLevelUpCard(options: LevelUpCardOptions): Promise<AttachmentBuilder> {
  const canvas = await createBaseCanvas("#e7ad55", LEVEL_UP_BACKGROUND);
  const context = canvas.getContext("2d");
  const name = cleanName(options.displayName, options.user.username);
  await drawAvatar(context, options.user, name, 220, 200, 126, "#ffe4a8");
  drawEyebrow(context, "THE SANDS RECOGNIZE YOU", "#d8b06b");
  drawName(context, name);
  context.fillStyle = "#fff1cc";
  context.font = "bold 76px sans-serif";
  context.fillText(`LEVEL ${options.level}`, 410, 240);
  context.fillStyle = "rgba(243, 211, 155, 0.88)";
  context.font = "22px sans-serif";
  context.fillText(`${options.profile.xp.toLocaleString()} TOTAL XP  •  THE JOURNEY CONTINUES`, 414, 292);
  drawSeal(context, "▲", "ASCENDED", "#e7ad55");
  return attachment(canvas.toBuffer("image/png"), LEVEL_UP_CARD_FILENAME, `${name} reached community level ${options.level}`);
}

async function createAchievementCard(options: AchievementCardOptions): Promise<AttachmentBuilder> {
  const theme = achievementTheme(options.achievement.kind);
  const canvas = await createBaseCanvas(theme.accent, ACHIEVEMENT_BACKGROUNDS[options.achievement.kind]);
  const context = canvas.getContext("2d");
  const name = cleanName(options.displayName, options.user.username);
  await drawAvatar(context, options.user, name, 220, 200, 126, theme.accent);
  drawEyebrow(context, `${theme.icon}  ACHIEVEMENT UNLOCKED  •  ${options.achievement.tier.toUpperCase()}`, theme.accent);
  drawName(context, name);
  context.fillStyle = "#fff4d7";
  fitFont(context, options.achievement.name, 58, 32, 610, "bold");
  context.fillText(options.achievement.name, 410, 234);
  context.fillStyle = theme.accent;
  context.font = "bold 20px sans-serif";
  context.fillText(achievementProgressLabel(options.achievement), 414, 278);
  context.fillStyle = "rgba(255, 239, 207, 0.78)";
  context.font = "18px sans-serif";
  context.fillText(options.achievement.description, 414, 318);
  drawSeal(context, theme.icon, options.achievement.tier.toUpperCase(), theme.accent);
  return attachment(canvas.toBuffer("image/png"), ACHIEVEMENT_CARD_FILENAMES[options.achievement.kind], `${name} unlocked ${options.achievement.name} (${options.achievement.tier})`);
}

async function createBaseCanvas(accent: string, backgroundPath: string): Promise<ReturnType<typeof createCanvas>> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  let backgroundPromise = backgroundPromises.get(backgroundPath);
  if (!backgroundPromise) {
    // Dev note: Every achievement gets its own horizon; reusing the same desert would be suspiciously economical.
    backgroundPromise = loadImage(backgroundPath);
    backgroundPromises.set(backgroundPath, backgroundPromise);
  }
  drawImageCover(context, await backgroundPromise);
  const shade = context.createLinearGradient(0, 0, WIDTH, 0);
  shade.addColorStop(0, "rgba(8, 5, 3, 0.30)");
  shade.addColorStop(0.36, "rgba(8, 5, 3, 0.72)");
  shade.addColorStop(1, "rgba(8, 5, 3, 0.92)");
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = accent;
  context.globalAlpha = 0.55;
  context.lineWidth = 3;
  roundedRect(context, 24, 24, WIDTH - 48, HEIGHT - 48, 28);
  context.stroke();
  context.globalAlpha = 1;
  return canvas;
}

function drawImageCover(context: CanvasRenderingContext2D, image: Image): void {
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  context.drawImage(image, (WIDTH - renderedWidth) / 2, (HEIGHT - renderedHeight) / 2, renderedWidth, renderedHeight);
}

async function drawAvatar(context: CanvasRenderingContext2D, user: User, name: string, x: number, y: number, radius: number, accent: string): Promise<void> {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    context.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  } catch {
    const gradient = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    gradient.addColorStop(0, accent);
    gradient.addColorStop(1, "#211108");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.fillStyle = "#fff1cc";
    context.font = "bold 64px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(initials(name), x, y + 4);
  }
  context.restore();
  context.beginPath();
  context.arc(x, y, radius + 5, 0, Math.PI * 2);
  context.strokeStyle = accent;
  context.lineWidth = 8;
  context.stroke();
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawEyebrow(context: CanvasRenderingContext2D, text: string, accent: string): void {
  context.fillStyle = accent;
  context.font = "bold 18px sans-serif";
  context.fillText(text, 414, 88);
}

function drawName(context: CanvasRenderingContext2D, name: string): void {
  context.fillStyle = "rgba(255, 241, 204, 0.82)";
  fitFont(context, name, 34, 24, 610, "bold");
  context.fillText(name, 412, 142);
}

function drawSeal(context: CanvasRenderingContext2D, icon: string, label: string, accent: string): void {
  context.beginPath();
  context.arc(1_070, 200, 76, 0, Math.PI * 2);
  context.fillStyle = "rgba(12, 7, 4, 0.78)";
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = accent;
  context.textAlign = "center";
  context.font = "bold 42px sans-serif";
  context.fillText(icon, 1_070, 202);
  context.font = "bold 13px sans-serif";
  context.fillText(label, 1_070, 236);
  context.textAlign = "start";
}

function achievementTheme(kind: AchievementKind): { accent: string; icon: string } {
  if (kind === "message") return { accent: "#d9823b", icon: "✦" };
  if (kind === "voice") return { accent: "#66c7d5", icon: "◖" };
  return { accent: "#b48cff", icon: "▲" };
}

function cleanName(displayName: string, fallback: string): string {
  return canvasDisplayName(displayName, fallback);
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase() || "AC";
}

function fitFont(context: CanvasRenderingContext2D, text: string, start: number, minimum: number, width: number, weight: string): void {
  let size = start;
  do {
    context.font = `${weight} ${size}px sans-serif`;
    size -= 1;
  } while (size >= minimum && context.measureText(text).width > width);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function attachment(buffer: Buffer, name: string, description: string): AttachmentBuilder {
  return new AttachmentBuilder(buffer, { name, description });
}

export { ACHIEVEMENT_CARD_FILENAMES, LEVEL_UP_CARD_FILENAME, createAchievementCard, createLevelUpCard };
