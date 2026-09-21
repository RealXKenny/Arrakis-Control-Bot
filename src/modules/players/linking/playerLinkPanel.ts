import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createLogger } from "../../../client/logger";
import { findPanelMessage } from "../../../shared/discord/findPanelMessage";
import { createDuneBanner } from "../../../shared/discord/imageFactory";

const logger = createLogger("PLAYER PANEL");

const PANEL_MARKER = "# Link Account";
const PANEL_IMAGE_NAME = "dune-player-link.png";

function buildPlayerLinkPanel(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Dune desert landscape for character linking")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent("Link your Discord account to your Dune account.\n\nYou must be online before you can receive a verification code."))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder().setCustomId("player-link").setLabel("Link Account").setStyle(ButtonStyle.Primary),

        new ButtonBuilder().setCustomId("player-unlink").setLabel("Unlink Account").setStyle(ButtonStyle.Danger),
      ),
    );
}

async function ensurePlayerLinkPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot create player link panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Panel channel ${channelId} is not a sendable channel.`);
  }

  const existingPanel = await findPanelMessage(channel, client.user.id, PANEL_MARKER);

  const panel = buildPlayerLinkPanel();
  const banner = createPlayerLinkBanner();

  if (existingPanel) {
    const editPayload: MessageEditOptions = {
      content: null,
      embeds: [],
      attachments: [],
      components: [panel],
      files: [banner],
    };

    await existingPanel.edit(editPayload);

    logger.info(`Updated the player link panel in channel ${channelId}.`);

    return;
  }

  const payload: MessageCreateOptions = {
    components: [panel],
    files: [banner],
    flags: MessageFlags.IsComponentsV2,
  };

  await channel.send(payload);

  logger.info(`Posted player link panel in channel ${channelId}.`);
}

function createPlayerLinkBanner() {
  return createDuneBanner({
    artwork: "player-link",
    filename: PANEL_IMAGE_NAME,
    title: "Link Account",
    subtitle: "CONNECT YOUR ACCOUNT",
    detail: "YOUR PATH THROUGH ARRAKIS BEGINS HERE",
  });
}

export { ensurePlayerLinkPanel };
