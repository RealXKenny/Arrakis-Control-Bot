import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, StringSelectMenuBuilder, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createLogger } from "../../infrastructure/core/logger";
import { createTicketSupportBanner } from "../../shared/factories/imageFactory";
import { findPanelMessage } from "../../shared/utils/findPanelMessage";
import { TICKET_CATEGORIES } from "../tickets/ticketCategories";

const logger = createLogger("TICKET PANEL");
const PANEL_MARKER = "## Open a private support ticket";
const LEGACY_PANEL_MARKER = "## Arrakis Support Tickets";
const PANEL_IMAGE_NAME = "arrakis-support-tickets.png";

function buildTicketPanel(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Arrakis support ticket banner")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) =>
      text.setContent("Choose the route that best matches your request. A short intake will collect the context staff need before opening your private channel."),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("### Where should we route you?"))
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket-category")
          .setPlaceholder("What can we help you with?")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(TICKET_CATEGORIES.map(({ value, label, description, emoji }) => ({ value, label, description, emoji }))),
      ),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("🔒 **Private** — visible only to you and staff\n🔗 **Connected** — linked Dune details attach automatically\n🧾 **Recorded** — closure saves a transcript and removes the channel\n\n*One active ticket per member.*"));
}

async function ensureTicketPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    return;
  }

  if (!client.tickets) {
    logger.warn("Ticket panel is disabled: DATABASE_URL is not configured.");
    return;
  }

  if (!client.user) {
    throw new Error("Cannot create ticket panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Ticket panel channel ${channelId} is not a sendable channel.`);
  }

  const existing = (await findPanelMessage(channel, client.user.id, PANEL_MARKER)) ?? (await findPanelMessage(channel, client.user.id, LEGACY_PANEL_MARKER));

  if (existing) {
    const payload: MessageEditOptions = {
      content: null,
      embeds: [],
      components: [buildTicketPanel()],
      files: [createTicketBanner()],
    };

    await existing.edit(payload);
    logger.info(`Updated the ticket panel in channel ${channelId}.`);
    return;
  }

  const payload: MessageCreateOptions = {
    components: [buildTicketPanel()],
    files: [createTicketBanner()],
    flags: MessageFlags.IsComponentsV2,
  };

  await channel.send(payload);
  logger.info(`Posted the ticket panel in channel ${channelId}.`);
}

function createTicketBanner() {
  return createTicketSupportBanner({
    filename: PANEL_IMAGE_NAME,
    categories: TICKET_CATEGORIES.map(({ label }) => label),
  });
}

export { ensureTicketPanel };
