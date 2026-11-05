import fs from "node:fs";
import path from "node:path";
import { AttachmentBuilder, type GuildMember } from "discord.js";
import { createCanvas, Image, loadImage, type CanvasRenderingContext2D } from "canvas";

type PanelArtworkKey = "backups" | "blueprint" | "bot-control" | "bot-info" | "faq" | "goodbye" | "market" | "music" | "ping" | "player-link" | "players" | "profile" | "release" | "roles" | "rules" | "server-info" | "server-status" | "staff-application" | "storm" | "temporary" | "tickets" | "verification" | "voice" | "vps" | "welcome";

const PANEL_ARTWORK: Readonly<Record<PanelArtworkKey, string>> = Object.freeze({
  backups: "panel-backups.png",
  blueprint: "panel-blueprint.png",
  "bot-control": "panel-bot-control.png",
  "bot-info": "panel-bot-info.png",
  faq: "panel-faq.png",
  goodbye: "panel-goodbye.png",
  market: "panel-market.png",
  music: "panel-music.png",
  ping: "panel-ping.png",
  "player-link": "panel-player-link.png",
  players: "panel-players.png",
  profile: "panel-profile.png",
  release: "panel-release.png",
  roles: "panel-roles.png",
  rules: "panel-rules.png",
  "server-info": "panel-server-info.png",
  "server-status": "panel-server-status.png",
  "staff-application": "panel-staff-application.png",
  storm: "panel-storm.png",
  temporary: "panel-temporary.png",
  tickets: "panel-tickets.png",
  verification: "panel-verification.png",
  voice: "panel-voice.png",
  vps: "panel-vps.png",
  welcome: "panel-welcome.png",
});
const artworkCache = new Map<PanelArtworkKey, Image>();
const PANEL_ARTWORK_KEYS = Object.freeze(Object.keys(PANEL_ARTWORK) as PanelArtworkKey[]);

interface PanelBannerOptions {
  artwork: PanelArtworkKey;
  filename: string;
  title: string;
  subtitle?: string;
  detail?: string;
}

interface MemberBannerOptions {
  artwork: "goodbye" | "welcome";
  filename: string;
  title: string;
  member: GuildMember;
}

interface TicketSupportBannerOptions {
  filename: string;
  categories: readonly string[];
}

function drawPanelBanner(context: CanvasRenderingContext2D, width: number, height: number, { artwork, title, subtitle, detail }: Omit<PanelBannerOptions, "filename">): void {
  drawImageCover(context, panelArtwork(artwork), width, height);
  const shade = context.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "rgba(8, 10, 20, 0.78)");
  shade.addColorStop(0.5, "rgba(8, 10, 20, 0.5)");
  shade.addColorStop(1, "rgba(8, 10, 20, 0)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#8f9bff";
  context.fillRect(64, 92, 56, 5);

  context.fillStyle = "#ffffff";
  setFittedFont(context, title, 54, 30, 650, "bold");
  context.fillText(title, 64, 166);

  context.fillStyle = "#c7cdff";
  const subtitleText = subtitle ?? "Arrakis Control";
  setFittedFont(context, subtitleText, 26, 18, 650, "normal");
  context.fillText(subtitleText, 66, 214);

  context.fillStyle = "#98a2c8";
  const detailText = detail ?? "Community toolkit";
  setFittedFont(context, detailText, 22, 16, 650, "normal");
  context.fillText(detailText, 66, 262);
}

function createPanelBanner({ artwork, filename, title, subtitle, detail }: PanelBannerOptions): AttachmentBuilder {
  const canvas = createCanvas(1200, 400);
  const context = canvas.getContext("2d");

  drawPanelBanner(context, 1200, 400, {
    artwork,
    title,
    subtitle,
    detail,
  });

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: filename })
    .setDescription(`${title} — ${subtitle ?? "Arrakis Control"}. ${detail ?? "Community toolkit"}.`);
}

function createTicketSupportBanner({ filename, categories }: TicketSupportBannerOptions): AttachmentBuilder {
  const width = 1400;
  const height = 560;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  drawImageCover(context, panelArtwork("tickets"), width, height);

  context.fillStyle = "rgba(8, 10, 20, 0.6)";
  context.fillRect(0, 0, 760, height);
  context.fillStyle = "#8f9bff";
  context.fillRect(70, 66, 72, 5);

  context.fillStyle = "#8f9bff";
  context.font = "bold 20px sans-serif";
  context.fillText("ARRAKIS CONTROL", 70, 112);

  context.fillStyle = "#ffffff";
  context.font = "bold 64px sans-serif";
  context.fillText("Support Desk", 66, 190);

  context.fillStyle = "#c7cdff";
  context.font = "26px sans-serif";
  context.fillText("Private help from the staff team", 70, 238);

  context.strokeStyle = "rgba(143, 155, 255, 0.5)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(70, 274);
  context.lineTo(660, 274);
  context.stroke();

  context.fillStyle = "#e4e7ff";
  context.font = "24px sans-serif";
  context.fillText("Choose a category and share the details.", 70, 328);
  context.fillText("Staff will follow up in your private channel.", 70, 366);

  context.fillStyle = "#98a2c8";
  context.font = "bold 18px sans-serif";
  context.fillText("Private  •  Tracked  •  Transcript saved", 70, 448);

  drawCategoryCard(context, categories);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: filename })
    .setDescription("Arrakis Control support desk and available ticket categories.");
}

function drawCategoryCard(context: CanvasRenderingContext2D, categories: readonly string[]): void {
  const x = 820;
  const y = 64;
  const width = 510;
  const height = 430;

  roundedRect(context, x, y, width, height, 24);
  context.fillStyle = "rgba(10, 13, 28, 0.78)";
  context.fill();
  context.strokeStyle = "rgba(143, 155, 255, 0.3)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = "bold 25px sans-serif";
  context.fillText("Categories", x + 34, y + 52);

  context.fillStyle = "#98a2c8";
  context.font = "19px sans-serif";
  context.fillText("Select the closest match in Discord", x + 34, y + 82);

  // Dev note: Six categories fit the card; a seventh would need a scrollbar and a strongly worded RFC.
  categories.slice(0, 6).forEach((label, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemX = x + 32 + column * 232;
    const itemY = y + 112 + row * 88;

    roundedRect(context, itemX, itemY, 214, 60, 12);
    context.fillStyle = "rgba(91, 108, 255, 0.16)";
    context.fill();
    context.strokeStyle = "rgba(143, 155, 255, 0.35)";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "#8f9bff";
    context.beginPath();
    context.arc(itemX + 22, itemY + 30, 5, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#e4e7ff";
    context.font = "bold 19px sans-serif";
    context.fillText(label, itemX + 38, itemY + 36, 162);
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const boundedRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + boundedRadius, y);
  context.lineTo(x + width - boundedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + boundedRadius);
  context.lineTo(x + width, y + height - boundedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - boundedRadius, y + height);
  context.lineTo(x + boundedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - boundedRadius);
  context.lineTo(x, y + boundedRadius);
  context.quadraticCurveTo(x, y, x + boundedRadius, y);
  context.closePath();
}

async function createMemberBanner({ artwork, filename, title, member }: MemberBannerOptions): Promise<AttachmentBuilder> {
  const canvas = createCanvas(1200, 400);
  const context = canvas.getContext("2d");

  drawPanelBanner(context, 1200, 400, {
    artwork,
    title,
    subtitle: member.user.tag,
    detail: "Dune: Awakening community",
  });

  const avatar = await loadImage(
    member.user.displayAvatarURL({
      extension: "png",
      size: 256,
    }),
  );

  context.save();

  context.beginPath();
  context.arc(1010, 200, 105, 0, Math.PI * 2);
  context.clip();

  context.drawImage(avatar, 905, 95, 210, 210);

  context.restore();

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: filename })
    .setDescription(`${title} card for ${member.user.tag} in ${member.guild.name}.`);
}

function panelArtwork(key: PanelArtworkKey): Image {
  const cached = artworkCache.get(key);
  if (cached) return cached;
  const image = new Image();
  image.src = fs.readFileSync(path.resolve(process.cwd(), "data", "images", PANEL_ARTWORK[key]));
  artworkCache.set(key, image);
  return image;
}

function drawImageCover(context: CanvasRenderingContext2D, image: Image, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  context.drawImage(image, (width - renderedWidth) / 2, (height - renderedHeight) / 2, renderedWidth, renderedHeight);
}

function setFittedFont(context: CanvasRenderingContext2D, text: string, start: number, minimum: number, width: number, weight: string): void {
  let size = start;
  do {
    context.font = `${weight} ${size}px sans-serif`;
    size -= 1;
  } while (size >= minimum && context.measureText(text).width > width);
}

export { PANEL_ARTWORK_KEYS, createPanelBanner, createMemberBanner, createTicketSupportBanner };

export type { PanelBannerOptions, MemberBannerOptions, PanelArtworkKey, TicketSupportBannerOptions };
