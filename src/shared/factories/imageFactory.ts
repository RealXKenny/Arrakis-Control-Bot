import { AttachmentBuilder, type GuildMember } from "discord.js";
import { createCanvas, loadImage, type CanvasRenderingContext2D } from "canvas";

interface DuneBannerOptions {
  filename: string;
  title: string;
  subtitle?: string;
  detail?: string;
}

interface MemberBannerOptions {
  filename: string;
  title: string;
  member: GuildMember;
}

function drawDuneBanner(context: CanvasRenderingContext2D, width: number, height: number, { title, subtitle, detail }: Omit<DuneBannerOptions, "filename">): void {
  const gradient = context.createLinearGradient(0, 0, 0, height);

  gradient.addColorStop(0, "#180f0a");
  gradient.addColorStop(0.55, "#6f3d20");
  gradient.addColorStop(1, "#d2a85a");

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(8, 5, 3, 0.78)";
  context.fillRect(0, 0, 760, height);

  context.fillStyle = "#f3d39b";
  context.font = "bold 52px sans-serif";
  context.fillText(title.toUpperCase(), 64, 110);

  context.fillStyle = "#e6bd79";
  context.font = "26px sans-serif";
  context.fillText((subtitle ?? "ARRAKIS").toUpperCase(), 67, 160);

  context.fillStyle = "#ead5ad";
  context.font = "22px sans-serif";
  context.fillText(detail ?? "DUNE: AWAKENING", 67, 235);
}

function createDuneBanner({ filename, title, subtitle, detail }: DuneBannerOptions): AttachmentBuilder {
  const canvas = createCanvas(1200, 400);
  const context = canvas.getContext("2d");

  drawDuneBanner(context, 1200, 400, {
    title,
    subtitle,
    detail,
  });

  return new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: filename,
  });
}

async function createMemberBanner({ filename, title, member }: MemberBannerOptions): Promise<AttachmentBuilder> {
  const canvas = createCanvas(1200, 400);
  const context = canvas.getContext("2d");

  drawDuneBanner(context, 1200, 400, {
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

  return new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: filename,
  });
}

export { createDuneBanner, createMemberBanner };

export type { DuneBannerOptions, MemberBannerOptions };
