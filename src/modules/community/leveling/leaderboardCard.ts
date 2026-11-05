import path from "node:path";
import { AttachmentBuilder, type User } from "discord.js";
import { createCanvas, loadImage, type CanvasRenderingContext2D, type Image } from "canvas";
import type { LevelProfile } from "../../../infrastructure/database/leveling/LevelRepository";
import { canvasDisplayName } from "../../../shared/discord/canvasText";
import { levelForXp } from "./levelProgress";
import { roleTierForLevel } from "./levelRoles";

const LEVEL_LEADERBOARD_FILENAME = "arrakis-community-leaderboard.png";
const LEADERBOARD_BACKGROUND = path.resolve(process.cwd(), "data", "images", "community-level-leaderboard-background.png");
const WIDTH = 1_200;
const HEIGHT = 740;
const ROW_TOP = 124;
const ROW_HEIGHT = 50;
const ROW_GAP = 6;

let backgroundPromise: Promise<Image> | undefined;

interface LevelLeaderboardEntry {
  profile: LevelProfile;
  user: User | null;
  displayName: string;
}

async function createLevelLeaderboardCard(entries: readonly LevelLeaderboardEntry[]): Promise<AttachmentBuilder> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  // Dev note: Fetch the portraits together; even the Landsraad dislikes waiting in single file.
  const [background, ...avatars] = await Promise.all([
    loadLeaderboardBackground(),
    ...entries.map((entry) => loadAvatar(entry.user)),
  ]);

  drawBackground(context, background);
  drawHeader(context);
  if (entries.length) entries.slice(0, 10).forEach((entry, index) => drawEntry(context, entry, avatars[index] ?? null, index));
  else drawEmptyState(context);
  drawFooter(context, entries.length);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: LEVEL_LEADERBOARD_FILENAME,
    description: "community level leaderboard",
  });
}

function loadLeaderboardBackground(): Promise<Image> {
  backgroundPromise ??= loadImage(LEADERBOARD_BACKGROUND);
  return backgroundPromise;
}

async function loadAvatar(user: User | null): Promise<Image | null> {
  if (!user) return null;
  return loadImage(user.displayAvatarURL({ extension: "png", size: 128 })).catch(() => null);
}

function drawBackground(context: CanvasRenderingContext2D, background: Image): void {
  const scale = Math.max(WIDTH / background.width, HEIGHT / background.height);
  const width = background.width * scale;
  const height = background.height * scale;
  context.drawImage(background, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);

  const shade = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  shade.addColorStop(0, "rgba(10, 13, 28, 0.5)");
  shade.addColorStop(0.55, "rgba(8, 10, 20, 0.62)");
  shade.addColorStop(1, "rgba(8, 10, 20, 0.72)");
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawHeader(context: CanvasRenderingContext2D): void {
  context.fillStyle = "#8f9bff";
  context.font = "bold 18px sans-serif";
  context.fillText("ARRAKIS CONTROL  •  COMMUNITY LEVELS", 54, 46);
  context.fillStyle = "#ffffff";
  context.font = "bold 38px sans-serif";
  context.fillText("SERVER LEADERBOARD", 52, 88);

  context.fillStyle = "rgba(199, 205, 255, 0.7)";
  context.font = "bold 14px sans-serif";
  context.textAlign = "center";
  context.fillText("RANK", 84, 110);
  context.textAlign = "start";
  context.fillText("MEMBER", 164, 110);
  context.fillText("TIER", 530, 110);
  context.textAlign = "center";
  context.fillText("LEVEL", 872, 110);
  context.textAlign = "right";
  context.fillText("TOTAL XP", 1_120, 110);
  context.textAlign = "start";
}

function drawEntry(context: CanvasRenderingContext2D, entry: LevelLeaderboardEntry, avatar: Image | null, index: number): void {
  const y = ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
  const level = levelForXp(entry.profile.xp);
  const tier = roleTierForLevel(level)?.name ?? "Unranked Member";
  const rank = entry.profile.rank ?? index + 1;
  const displayName = cleanName(entry.displayName);

  roundedRect(context, 48, y, 1_104, ROW_HEIGHT, 13);
  context.fillStyle = index < 3 ? "rgba(42, 49, 112, 0.7)" : "rgba(8, 10, 20, 0.74)";
  context.fill();
  context.strokeStyle = index < 3 ? "rgba(143, 155, 255, 0.44)" : "rgba(143, 155, 255, 0.16)";
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = rankColor(rank);
  context.font = "bold 22px sans-serif";
  context.textAlign = "center";
  context.fillText(`#${rank}`, 84, y + 33);

  drawAvatar(context, avatar, displayName, 132, y + ROW_HEIGHT / 2, 18);

  context.textAlign = "start";
  context.fillStyle = "#ffffff";
  setFittedFont(context, displayName, 19, 13, 340, "bold");
  context.fillText(displayName, 164, y + 32);

  context.fillStyle = "#98a2c8";
  setFittedFont(context, tier.toUpperCase(), 15, 11, 240, "bold");
  context.fillText(tier.toUpperCase(), 530, y + 31);

  context.fillStyle = "#e4e7ff";
  context.font = "bold 20px sans-serif";
  context.textAlign = "center";
  context.fillText(String(level), 872, y + 32);
  context.textAlign = "right";
  context.fillText(entry.profile.xp.toLocaleString(), 1_120, y + 32);
  context.textAlign = "start";
}

function drawEmptyState(context: CanvasRenderingContext2D): void {
  context.fillStyle = "rgba(199, 205, 255, 0.82)";
  context.font = "bold 26px sans-serif";
  context.textAlign = "center";
  context.fillText("NO RANKED MEMBERS YET", WIDTH / 2, HEIGHT / 2 - 4);
  context.font = "17px sans-serif";
  context.fillStyle = "rgba(199, 205, 255, 0.62)";
  context.fillText("Earn community XP to claim the first spot.", WIDTH / 2, HEIGHT / 2 + 28);
  context.textAlign = "start";
}

function drawAvatar(context: CanvasRenderingContext2D, avatar: Image | null, displayName: string, x: number, y: number, radius: number): void {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  if (avatar) {
    context.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    // Dev note: If Discord loses the portrait, initials still report for desert duty.
    context.fillStyle = "#2a3170";
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.fillStyle = "#e4e7ff";
    context.font = "bold 14px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(initials(displayName), x, y + 1);
  }
  context.restore();
  context.beginPath();
  context.arc(x, y, radius + 1, 0, Math.PI * 2);
  context.strokeStyle = "#8f9bff";
  context.lineWidth = 2;
  context.stroke();
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawFooter(context: CanvasRenderingContext2D, entryCount: number): void {
  context.fillStyle = "rgba(199, 205, 255, 0.74)";
  context.font = "15px sans-serif";
  const text = entryCount
    ? "Ranks reflect total community XP  •  Message, voice, booster, and event XP all count"
    : "No members have earned community XP yet. Be the first on the board."
  context.fillText(text, 52, HEIGHT - 22);
  context.textAlign = "right";
  context.font = "italic 15px sans-serif";
  context.fillText("KEEP CLIMBING", 1_148, HEIGHT - 22);
  context.textAlign = "start";
}

function rankColor(rank: number): string {
  if (rank === 1) return "#c7cdff";
  if (rank === 2) return "#d9dde4";
  if (rank === 3) return "#9b6bff";
  return "#98a2c8";
}

function cleanName(value: string): string {
  return canvasDisplayName(value, "Unknown Member");
}

function initials(value: string): string {
  return Array.from(cleanName(value)).filter((character) => /[\p{L}\p{N}]/u.test(character)).slice(0, 2).join("").toUpperCase() || "AC";
}

function setFittedFont(context: CanvasRenderingContext2D, text: string, start: number, minimum: number, width: number, weight: string): void {
  let size = start;
  do {
    context.font = `${weight} ${size}px sans-serif`;
    size -= 1;
  } while (size >= minimum && context.measureText(text).width > width);
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

export { LEVEL_LEADERBOARD_FILENAME, createLevelLeaderboardCard };
export type { LevelLeaderboardEntry };
