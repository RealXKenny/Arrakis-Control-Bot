import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createV2Response } from "../../../shared/discord/componentFactory";
import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { findPanelMessage } from "../../../shared/discord/findPanelMessage";

const PANEL_MARKER = "## Verify Your Membership";
const PANEL_IMAGE_NAME = "membership-verification.png";

async function ensureVerificationPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot create verification panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Verification panel channel ${channelId} is not a sendable channel.`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Arrakis membership verification banner")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent("Complete the captcha to access the Arrakis community."))
    .addActionRowComponents((row) => row.addComponents(new ButtonBuilder().setCustomId("member-captcha").setLabel("Verify").setStyle(ButtonStyle.Primary)));

  const banner = createDuneBanner({
    artwork: "verification",
    filename: PANEL_IMAGE_NAME,
    title: "Verify",
    subtitle: "MEMBERSHIP CHECK",
    detail: "WELCOME TO ARRAKIS",
  });

  // Dev note: Normalize the banner name because null is a terrible attachment label.
  const bannerFile = {
    attachment: banner.attachment,
    name: banner.name ?? PANEL_IMAGE_NAME,
    description: banner.description ?? undefined,
  };

  const response = createV2Response([container], [bannerFile]);

  const payload: MessageCreateOptions = {
    components: response.components,
    files: response.files,
    flags: MessageFlags.IsComponentsV2,
  };

  const existing = await findPanelMessage(channel, client.user.id, PANEL_MARKER);

  if (existing) {
    // Dev note: Create and edit payloads are cousins, not identical twins.
    const editPayload: MessageEditOptions = {
      content: null,
      embeds: [],
      attachments: [],
      components: response.components,
      files: response.files,
    };

    await existing.edit(editPayload);

    return;
  }

  await channel.send(payload);
}

export { ensureVerificationPanel };
