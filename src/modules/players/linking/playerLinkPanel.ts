import { publishPersistentPanel } from "../../panels/persistentPanel";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client } from "discord.js";

import { containsText } from "../../../shared/discord/containsText";
import { createDuneBanner } from "../../../shared/discord/imageFactory";


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

  await publishPersistentPanel(client, channel, "player-link", {
    matches: (message) => containsText(message.components, PANEL_MARKER),
    payload: { components: [buildPlayerLinkPanel()], files: [createPlayerLinkBanner()], flags: MessageFlags.IsComponentsV2 },
  });
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
