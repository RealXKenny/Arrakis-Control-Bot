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

interface DuneBannerOptions {
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

function drawDuneBanner(context: CanvasRenderingContext2D, width: number, height: number, { artwork, title, subtitle, detail }: Omit<DuneBannerOptions, "filename">): void {
  drawImageCover(context, panelArtwork(artwork), width, height);
  const shade = context.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "rgba(5, 4, 3, 0.92)");
  shade.addColorStop(0.52, "rgba(8, 5, 3, 0.72)");
  shade.addColorStop(0.76, "rgba(8, 5, 3, 0.18)");
  shade.addColorStop(1, "rgba(8, 5, 3, 0.04)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#f3d39b";
  setFittedFont(context, title.toUpperCase(), 52, 30, 650, "bold");
  context.fillText(title.toUpperCase(), 64, 110);

  context.fillStyle = "#e6bd79";
  const subtitleText = (subtitle ?? "ARRAKIS").toUpperCase();
  setFittedFont(context, subtitleText, 26, 18, 650, "normal");
  context.fillText(subtitleText, 67, 160);

  context.fillStyle = "#ead5ad";
  const detailText = detail ?? "DUNE: AWAKENING";
  setFittedFont(context, detailText, 22, 16, 650, "normal");
  context.fillText(detailText, 67, 235);
}

function createDuneBanner({ artwork, filename, title, subtitle, detail }: DuneBannerOptions): AttachmentBuilder {
  const canvas = createCanvas(1200, 400);
  const context = canvas.getContext("2d");

  drawDuneBanner(context, 1200, 400, {
    artwork,
    title,
    subtitle,
    detail,
  });

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: filename })
    .setDescription(`${title} — ${subtitle ?? "Arrakis Control"}. ${detail ?? "Dune: Awakening"}.`);
}

function createTicketSupportBanner({ filename, categories }: TicketSupportBannerOptions): AttachmentBuilder {
  const width = 1400;
  const height = 560;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  drawImageCover(context, panelArtwork("tickets"), width, height);

  const glow = context.createRadialGradient(1130, 90, 5, 1130, 90, 330);
  glow.addColorStop(0, "rgba(255, 211, 132, 0.44)");
  glow.addColorStop(0.45, "rgba(197, 139, 69, 0.13)");
  glow.addColorStop(1, "rgba(197, 139, 69, 0)");
  context.fillStyle = glow;
  context.fillRect(760, 0, 640, 420);

  drawSupportDunes(context, width, height);

  context.fillStyle = "rgba(8, 5, 3, 0.72)";
  context.fillRect(0, 0, 760, height);
  context.fillStyle = "#d2a85a";
  context.fillRect(70, 66, 72, 5);

  context.fillStyle = "#d8b06b";
  context.font = "bold 20px sans-serif";
  context.fillText("ARRAKIS CONTROL", 70, 112);

  context.fillStyle = "#f7dfa9";
  context.font = "bold 64px sans-serif";
  context.fillText("SUPPORT DESK", 66, 190);

  context.fillStyle = "#e6bd79";
  context.font = "26px sans-serif";
  context.fillText("PRIVATE HELP ACROSS THE IMPERIUM", 70, 238);

  context.strokeStyle = "rgba(210, 168, 90, 0.65)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(70, 274);
  context.lineTo(660, 274);
  context.stroke();

  context.fillStyle = "#ead5ad";
  context.font = "24px sans-serif";
  context.fillText("Choose a route. Share the details.", 70, 328);
  context.fillText("Your staff team will meet you there.", 70, 366);

  context.fillStyle = "rgba(216, 176, 107, 0.86)";
  context.font = "bold 18px sans-serif";
  context.fillText("PRIVATE  •  TRACKED  •  TRANSCRIPT SAVED", 70, 448);

  drawCategoryCard(context, categories);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: filename })
    .setDescription("Arrakis Control support desk and available ticket routes.");
}

function drawCategoryCard(context: CanvasRenderingContext2D, categories: readonly string[]): void {
  const x = 820;
  const y = 64;
  const width = 510;
  const height = 430;

  roundedRect(context, x, y, width, height, 24);
  context.fillStyle = "rgba(14, 9, 6, 0.78)";
  context.fill();
  context.strokeStyle = "rgba(243, 211, 155, 0.28)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#f3d39b";
  context.font = "bold 25px sans-serif";
  context.fillText("SUPPORT ROUTES", x + 34, y + 52);

  context.fillStyle = "#bd9761";
  context.font = "19px sans-serif";
  context.fillText("Select the closest match in Discord", x + 34, y + 82);

  // Dev note: Six routes fit the sign; route seven would need its own ornithopter.
  categories.slice(0, 6).forEach((label, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemX = x + 32 + column * 232;
    const itemY = y + 112 + row * 88;

    roundedRect(context, itemX, itemY, 214, 60, 12);
    context.fillStyle = "rgba(197, 139, 69, 0.14)";
    context.fill();
    context.strokeStyle = "rgba(210, 168, 90, 0.35)";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "#d2a85a";
    context.beginPath();
    context.arc(itemX + 22, itemY + 30, 5, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ead5ad";
    context.font = "bold 19px sans-serif";
    context.fillText(label, itemX + 38, itemY + 36, 162);
  });
}

function drawSupportDunes(context: CanvasRenderingContext2D, width: number, height: number): void {
  const layers = [
    { y: 420, amplitude: 34, color: "rgba(91, 47, 24, 0.82)", offset: 0 },
    { y: 468, amplitude: 28, color: "rgba(145, 79, 38, 0.88)", offset: 180 },
    { y: 514, amplitude: 20, color: "rgba(197, 139, 69, 0.76)", offset: 390 },
  ];

  for (const layer of layers) {
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(0, layer.y);

    for (let x = 0; x <= width; x += 24) {
      context.lineTo(x, layer.y + Math.sin((x + layer.offset) / 150) * layer.amplitude);
    }

    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = layer.color;
    context.fill();
  }
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

  drawDuneBanner(context, 1200, 400, {
    artwork,
    title,
    subtitle: member.user.tag,
    detail: "DUNE: AWAKENING COMMUNITY",
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

export { PANEL_ARTWORK_KEYS, createDuneBanner, createMemberBanner, createTicketSupportBanner };

export type { DuneBannerOptions, MemberBannerOptions, PanelArtworkKey, TicketSupportBannerOptions };
