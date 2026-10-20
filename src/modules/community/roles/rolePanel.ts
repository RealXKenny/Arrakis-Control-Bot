import { publishPersistentPanel } from "../../panels/persistentPanel";
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, StringSelectMenuBuilder, type Client } from "discord.js";

import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { CLEAR_ROLES_VALUE, getConfiguredRoleOptions } from "./selfAssignableRoles";
import { containsText } from "../../../shared/discord/containsText";

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

  const roleContainer = buildRolePanel();

  const banner = createDuneBanner({
    artwork: "roles",
    filename: PANEL_IMAGE_NAME,
    title: "Choose Roles",
    subtitle: "COMMUNITY ROLES",
    detail: "PLAYSTYLE • FACTIONS • NOTIFICATIONS",
  });

  await publishPersistentPanel(client, channel, "roles", {
    matches: (message) => containsText(message.components, PANEL_MARKER),
    payload: { components: [roleContainer], files: [banner], flags: MessageFlags.IsComponentsV2 },
  });
}

function buildRolePanel(): ContainerBuilder {
  const roleOptions = getConfiguredRoleOptions();

  if (roleOptions.length === 0) {
    throw new Error("No self-assignable roles are configured.");
  }

  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Arrakis role selection banner")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent("Select your playstyle, faction, and notification roles below. Your selections are updated automatically."))
    .addActionRowComponents((row) => row.setComponents(new StringSelectMenuBuilder()
      .setCustomId("self-assignable-roles")
      .setPlaceholder("Choose your roles")
      .setMinValues(1)
      .setMaxValues(roleOptions.length)
      .addOptions([...roleOptions, { label: "Clear all roles", description: "Remove every self-assignable role.", value: CLEAR_ROLES_VALUE }])));
}

export { buildRolePanel, ensureRolePanel };
