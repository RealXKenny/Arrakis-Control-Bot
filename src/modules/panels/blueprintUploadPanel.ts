import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createCanvas } from "canvas";

import { createLogger } from "../../client/logger";
import { findPanelMessage } from "../../shared/utils/findPanelMessage";

const logger = createLogger("BLUEPRINT PANEL");

const PANEL_IMAGE_NAME = "dune-blueprint-import.png";
const PANEL_MARKER = "# Import Blueprint";

function buildBlueprintUploadPanel(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Dune blueprint import illustration")))
    .addTextDisplayComponents((text) => text.setContent("# Import Blueprint"))
    .addTextDisplayComponents((text) => text.setContent("Upload one blueprint file to your linked character's backpack.\n\nYour linked character must be offline for at least **one minute** before importing."))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder().setCustomId("blueprint-upload").setLabel("Upload Blueprint").setStyle(ButtonStyle.Success),

        new ButtonBuilder().setLabel("Blueprint Gallery").setStyle(ButtonStyle.Link).setURL("https://dune.layout.tools"),
      ),
    );
}

async function ensureBlueprintUploadPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    logger.warn("Blueprint panel is disabled: BLUEPRINT_PANEL_CHANNEL_ID is not configured.");

    return;
  }

  if (!client.user) {
    throw new Error("Cannot create blueprint panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Blueprint panel channel ${channelId} is not a sendable channel.`);
  }

  const existingPanel = await findPanelMessage(channel, client.user.id, PANEL_MARKER);

  if (existingPanel) {
    const editPayload: MessageEditOptions = {
      content: null,
      embeds: [],
      components: [buildBlueprintUploadPanel()],
      files: [createBlueprintBanner()],
    };

    await existingPanel.edit(editPayload);

    logger.info(`Updated the blueprint upload panel in channel ${channelId}.`);

    return;
  }

  const payload: MessageCreateOptions = {
    components: [buildBlueprintUploadPanel()],
    files: [createBlueprintBanner()],
    flags: MessageFlags.IsComponentsV2,
  };

  await channel.send(payload);

  logger.info(`Posted blueprint upload panel in channel ${channelId}.`);
}

function createBlueprintBanner(): AttachmentBuilder {
  const canvas = createCanvas(1200, 400);

  const context = canvas.getContext("2d");

  const background = context.createLinearGradient(0, 0, 0, canvas.height);

  background.addColorStop(0, "#180f0a");

  background.addColorStop(0.55, "#6f3d20");

  background.addColorStop(1, "#d2a85a");

  context.fillStyle = background;

  context.fillRect(0, 0, canvas.width, canvas.height);

  drawDunes(context, canvas);

  context.fillStyle = "rgba(8, 5, 3, 0.74)";

  context.fillRect(0, 0, 700, canvas.height);

  context.fillStyle = "#f3d39b";
  context.font = "bold 52px sans-serif";

  context.fillText("BLUEPRINT IMPORT", 64, 110);

  context.fillStyle = "#e6bd79";
  context.font = "24px sans-serif";

  context.fillText("BUILD YOUR LEGEND ON ARRAKIS", 67, 153);

  context.strokeStyle = "#c58b45";
  context.lineWidth = 2;

  context.beginPath();

  context.moveTo(67, 178);

  context.lineTo(630, 178);

  context.stroke();

  context.fillStyle = "#ead5ad";
  context.font = "22px sans-serif";

  context.fillText("Import one blueprint to your character.", 67, 232);

  context.font = "18px sans-serif";

  context.fillStyle = "#d8bb83";

  context.fillText("Your character must be offline for one minute.", 67, 345);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: PANEL_IMAGE_NAME,
  });
}

interface DuneLayer {
  y: number;
  height: number;
  color: string;
  offset: number;
}

type Canvas = ReturnType<typeof createCanvas>;

type CanvasContext = ReturnType<Canvas["getContext"]>;

function drawDunes(context: CanvasContext, canvas: Canvas): void {
  const layers: DuneLayer[] = [
    {
      y: 270,
      height: 70,
      color: "#743a1b",
      offset: 0,
    },
    {
      y: 315,
      height: 60,
      color: "#9a592e",
      offset: 150,
    },
    {
      y: 350,
      height: 45,
      color: "#b87333",
      offset: 300,
    },
    {
      y: 376,
      height: 30,
      color: "#d2a85a",
      offset: 500,
    },
  ];

  for (const { y, height, color, offset } of layers) {
    context.beginPath();

    context.moveTo(0, canvas.height);

    context.lineTo(0, y);

    for (let x = 0; x <= canvas.width; x += 20) {
      context.lineTo(x, y + Math.sin((x + offset) / 130) * height * 0.25 + Math.sin((x + offset) / 270) * height * 0.2);
    }

    context.lineTo(canvas.width, canvas.height);

    context.closePath();

    context.fillStyle = color;

    context.fill();
  }
}

export { ensureBlueprintUploadPanel };
