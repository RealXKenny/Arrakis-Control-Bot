import { publishPersistentPanel } from "../../panels/persistentPanel";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client } from "discord.js";
import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { containsText } from "../../../shared/discord/containsText";

const PANEL_MARKER = "## Join the Crimson Skies staff";
const PANEL_IMAGE_NAME = "arrakis-staff-applications.png";

function buildStaffApplicationPanel(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Crimson Skies staff application banner")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent("Help guide the community through the storms of Arrakis. Applications are reviewed privately by the leadership team."))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("**Before applying**\n• Answer every question honestly and with useful detail.\n• One application may be pending at a time.\n• Decisions and feedback are delivered privately."))
    .addActionRowComponents((row) => row.setComponents(new ButtonBuilder().setCustomId("staff-application:open").setLabel("Apply for Staff").setEmoji("📜").setStyle(ButtonStyle.Primary)));
}

async function ensureStaffApplicationPanel(client: Client): Promise<void> {
  const service = client.staffApplications;
  if (!service || !client.user) return;
  const channel = await client.channels.fetch(service.config.panelChannelId);
  if (!channel || !channel.isSendable()) throw new Error(`Staff application panel channel ${service.config.panelChannelId} is not sendable.`);
  const components = [buildStaffApplicationPanel()];
  const files = [createDuneBanner({ artwork: "staff-application", filename: PANEL_IMAGE_NAME, title: "Answer the call", subtitle: "Crimson Skies staff", detail: "Serve the sietch. Guide the community." })];
  await publishPersistentPanel(client, channel, "staff-applications", {
    matches: (message) => containsText(message.components, PANEL_MARKER),
    payload: { components, files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } },
  });
}

export { PANEL_MARKER, buildStaffApplicationPanel, ensureStaffApplicationPanel };
