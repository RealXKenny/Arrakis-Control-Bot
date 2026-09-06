import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, StringSelectMenuBuilder, type Client } from "discord.js";

import { createDuneBanner } from "../../shared/factories/imageFactory.js";
import { getConfiguredRoleOptions } from "../../shared/constants/selfAssignableRoles.js";
import { findPanelMessage } from "../../shared/utils/findPanelMessage.js";

const PANEL_MARKER = "## Choose Your Arrakis Roles";
const PANEL_IMAGE_NAME = "role-selection.png";

async function ensureRolePanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot create role panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Role panel channel ${channelId} is not a sendable channel.`);
  }

  const roleOptions = getRoleOptions();

  if (roleOptions.length === 0) {
    throw new Error("No self-assignable roles are configured.");
  }

  const roleContainer = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Arrakis role selection banner")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent("Select your playstyle, faction, and notification roles below. Your selections are updated automatically."))
    .addActionRowComponents((row) => row.setComponents(new StringSelectMenuBuilder().setCustomId("self-assignable-roles").setPlaceholder("Choose your roles").setMinValues(0).setMaxValues(Math.min(roleOptions.length, 10)).addOptions(roleOptions)));

  const existingPanel = await findPanelMessage(channel, client.user.id, PANEL_MARKER);

  if (existingPanel) {
    const banner = createDuneBanner({
      filename: PANEL_IMAGE_NAME,
      title: "Choose Roles",
      subtitle: "COMMUNITY ROLES",
      detail: "PLAYSTYLE • FACTIONS • NOTIFICATIONS",
    });

    await existingPanel.edit({
      content: null,
      embeds: [],
      components: [roleContainer],
      files: [
        {
          attachment: banner.attachment,
          name: PANEL_IMAGE_NAME,
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    return;
  }

  const banner = createDuneBanner({
    filename: PANEL_IMAGE_NAME,
    title: "Choose Roles",
    subtitle: "COMMUNITY ROLES",
    detail: "PLAYSTYLE • FACTIONS • NOTIFICATIONS",
  });

  await channel.send({
    components: [roleContainer],
    files: [banner],
    flags: MessageFlags.IsComponentsV2,
  });
}

function getRoleOptions() {
  return getConfiguredRoleOptions().map(({ label, description, value }) => ({
    label,
    description,
    value,
  }));
}

export { ensureRolePanel };
