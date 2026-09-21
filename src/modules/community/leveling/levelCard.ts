import path from "node:path";
import { AttachmentBuilder, type User } from "discord.js";
import { createCanvas, loadImage, type CanvasRenderingContext2D, type Image } from "canvas";
import type { LevelProfile } from "../../../infrastructure/database/leveling/LevelRepository";
import { levelForXp, xpForLevel } from "./levelProgress";
import { nextRoleTier, roleTierForLevel } from "./levelRoles";

const LEVEL_CARD_FILENAME = "arrakis-community-level.png";
const LEVEL_CARD_BACKGROUND = path.resolve(process.cwd(), "data", "images", "community-level-background.png");
const CARD_WIDTH = 1_200;
const CARD_HEIGHT = 400;
const AVATAR_CENTER_X = 201;
const AVATAR_CENTER_Y = 179;
const AVATAR_RADIUS = 109;
const AVATAR_RING_RADIUS = 111;

let backgroundPromise: Promise<Image> | undefined;

interface LevelCardOptions {
  user: User;
  displayName: string;
  profile: LevelProfile;
  multiplier?: number;
}

async function createLevelRankCard({ user, displayName, profile, multiplier = 1 }: LevelCardOptions): Promise<AttachmentBuilder> {
  const safeDisplayName = displayName.replace(/[\r\n]/g, " ").trim().slice(0, 80) || user.username;
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const context = canvas.getContext("2d");
  const background = await loadLevelBackground();

  context.drawImage(background, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawAtmosphere(context);
  await drawAvatar(context, user, safeDisplayName);
  drawProfile(context, safeDisplayName, profile, multiplier);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: LEVEL_CARD_FILENAME,
    description: `${safeDisplayName}'s Arrakis community level card`,
  });
}

function loadLevelBackground(): Promise<Image> {
  // Dev note: Cache the desert; rendering Arrakis from scratch for every command is hard on the spice budget.
  backgroundPromise ??= loadImage(LEVEL_CARD_BACKGROUND);
  return backgroundPromise;
}

function drawAtmosphere(context: CanvasRenderingContext2D): void {
  const shade = context.createLinearGradient(0, 0, CARD_WIDTH, 0);
  shade.addColorStop(0, "rgba(8, 5, 3, 0.18)");
  shade.addColorStop(0.3, "rgba(8, 5, 3, 0.38)");
  shade.addColorStop(1, "rgba(8, 5, 3, 0.74)");
  context.fillStyle = shade;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  roundedRect(context, 318, 32, 840, 336, 24);
  context.fillStyle = "rgba(13, 8, 5, 0.68)";
  context.fill();
  context.strokeStyle = "rgba(243, 211, 155, 0.28)";
  context.lineWidth = 2;
  context.stroke();
}

async function drawAvatar(context: CanvasRenderingContext2D, user: User, displayName: string): Promise<void> {
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    context.save();
    context.beginPath();
    context.arc(AVATAR_CENTER_X, AVATAR_CENTER_Y, AVATAR_RADIUS, 0, Math.PI * 2);
    context.clip();
    context.drawImage(avatar, AVATAR_CENTER_X - AVATAR_RADIUS, AVATAR_CENTER_Y - AVATAR_RADIUS, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    context.restore();
  } catch {
    drawAvatarFallback(context, displayName, AVATAR_CENTER_X, AVATAR_CENTER_Y, AVATAR_RADIUS);
  }

  // Dev note: This circle follows the background's solar halo; even profile pictures need proper orbital alignment.
  context.beginPath();
  context.arc(AVATAR_CENTER_X, AVATAR_CENTER_Y, AVATAR_RING_RADIUS, 0, Math.PI * 2);
  context.strokeStyle = "#f3d39b";
  context.lineWidth = 4;
  context.stroke();
}

function drawAvatarFallback(context: CanvasRenderingContext2D, displayName: string, x: number, y: number, radius: number): void {
  const gradient = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  gradient.addColorStop(0, "#8f542c");
  gradient.addColorStop(1, "#24130b");
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.fillStyle = "#f7dfa9";
  context.font = "bold 58px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(initials(displayName), x, y + 3);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawProfile(context: CanvasRenderingContext2D, displayName: string, profile: LevelProfile, multiplier: number): void {
  const level = levelForXp(profile.xp);
  const tier = roleTierForLevel(level);
  const nextTier = nextRoleTier(level);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const earned = profile.xp - floor;
  const required = Math.max(1, ceiling - floor);
  const progress = Math.min(1, earned / required);

  context.fillStyle = "#d8b06b";
  context.font = "bold 18px sans-serif";
  context.fillText("ARRAKIS CONTROL  •  COMMUNITY LEVEL", 356, 72);

  context.fillStyle = "#fff1cc";
  setFittedFont(context, displayName, 48, 28, 760, "bold");
  context.fillText(displayName, 352, 126);

  drawStat(context, 352, 150, 210, "LEVEL", String(level));
  drawStat(context, 578, 150, 210, "SERVER RANK", profile.rank ? `#${profile.rank}` : "UNRANKED");
  drawStat(context, 804, 150, 310, "TOTAL XP", profile.xp.toLocaleString());

  context.fillStyle = "#ead5ad";
  context.font = "bold 18px sans-serif";
  context.fillText("PROGRESS TO NEXT LEVEL", 352, 282);
  context.textAlign = "right";
  context.fillStyle = "#d8b06b";
  context.fillText(`${earned.toLocaleString()} / ${required.toLocaleString()} XP`, 1_114, 282);
  context.textAlign = "start";

  roundedRect(context, 352, 298, 762, 22, 11);
  context.fillStyle = "rgba(255, 255, 255, 0.12)";
  context.fill();
  if (progress > 0) {
    roundedRect(context, 352, 298, Math.max(22, 762 * progress), 22, 11);
    const progressGradient = context.createLinearGradient(352, 0, 1_114, 0);
    progressGradient.addColorStop(0, "#b96832");
    progressGradient.addColorStop(0.55, "#e7ad55");
    progressGradient.addColorStop(1, "#ffe3a0");
    context.fillStyle = progressGradient;
    context.fill();
  }

  context.fillStyle = "rgba(243, 211, 155, 0.82)";
  context.font = "16px sans-serif";
  const activity = `${formatCount(profile.messageCount, "message")}  •  ${formatCount(profile.voiceMinutes, "voice minute")}  •  ${multiplier}× XP`;
  context.fillText(activity, 352, 348);
  context.textAlign = "right";
  context.font = "italic 16px sans-serif";
  context.fillText(tier?.name.toUpperCase() ?? (nextTier ? `NEXT ROLE: ${nextTier.name.toUpperCase()}` : "THE SPICE MUST FLOW"), 1_114, 348);
  context.textAlign = "start";
}

function drawStat(context: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, value: string): void {
  roundedRect(context, x, y, width, 92, 14);
  context.fillStyle = "rgba(197, 139, 69, 0.12)";
  context.fill();
  context.strokeStyle = "rgba(216, 176, 107, 0.28)";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = "#bd9761";
  context.font = "bold 14px sans-serif";
  context.fillText(label, x + 18, y + 28);
  context.fillStyle = "#f7dfa9";
  setFittedFont(context, value, 32, 20, width - 36, "bold");
  context.fillText(value, x + 18, y + 68);
}

function setFittedFont(context: CanvasRenderingContext2D, text: string, start: number, minimum: number, width: number, weight: string): void {
  let size = start;
  do {
    context.font = `${weight} ${size}px sans-serif`;
    size -= 1;
  } while (size >= minimum && context.measureText(text).width > width);
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => Array.from(part)[0]).join("") : Array.from(value).slice(0, 2).join("")).toUpperCase() || "AC";
}

function formatCount(value: number, singular: string): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : `${singular}s`}`;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const bounded = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + bounded, y);
  context.lineTo(x + width - bounded, y);
  context.quadraticCurveTo(x + width, y, x + width, y + bounded);
  context.lineTo(x + width, y + height - bounded);
  context.quadraticCurveTo(x + width, y + height, x + width - bounded, y + height);
  context.lineTo(x + bounded, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - bounded);
  context.lineTo(x, y + bounded);
  context.quadraticCurveTo(x, y, x + bounded, y);
  context.closePath();
}

export { LEVEL_CARD_FILENAME, createLevelRankCard };
export type { LevelCardOptions };
