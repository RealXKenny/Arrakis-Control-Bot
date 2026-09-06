import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createV2Response } from "../../shared/factories/componentFactory.js";
import { createDuneBanner } from "../../shared/factories/imageFactory.js";
import { findPanelMessage } from "../../shared/utils/findPanelMessage.js";

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
    filename: PANEL_IMAGE_NAME,
    title: "Verify",
    subtitle: "MEMBERSHIP CHECK",
    detail: "WELCOME TO ARRAKIS",
  });

  /*
   * createDuneBanner() returns an AttachmentBuilder.
   *
   * If createV2Response() currently expects the project's V2File
   * shape, normalize the AttachmentBuilder here so its `name`
   * cannot be `null`.
   */
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
    /*
     * Do not spread `payload` here.
     *
     * MessageCreateOptions and MessageEditOptions have different
     * flag types. There is also no reason to resend the create
     * payload wholesale when editing an existing message.
     */
    const editPayload: MessageEditOptions = {
      content: null,
      embeds: [],
      components: response.components,
      files: response.files,
    };

    await existing.edit(editPayload);

    return;
  }

  await channel.send(payload);
}

export { ensureVerificationPanel };
