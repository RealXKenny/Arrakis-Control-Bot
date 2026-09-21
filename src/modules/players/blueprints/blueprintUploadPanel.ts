import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createLogger } from "../../../client/logger";
import { findPanelMessage } from "../../../shared/discord/findPanelMessage";
import { createDuneBanner } from "../../../shared/discord/imageFactory";

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

        new ButtonBuilder().setLabel("Dune Docker Blueprints").setStyle(ButtonStyle.Link).setURL("https://blueprints.dunedocker.app/"),
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
      attachments: [],
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

function createBlueprintBanner() {
  return createDuneBanner({
    artwork: "blueprint",
    filename: PANEL_IMAGE_NAME,
    title: "Blueprint Import",
    subtitle: "BUILD YOUR LEGEND ON ARRAKIS",
    detail: "IMPORT ONE BLUEPRINT TO YOUR CHARACTER",
  });
}

export { ensureBlueprintUploadPanel };
