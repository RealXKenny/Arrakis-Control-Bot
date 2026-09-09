import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";

import { buildTicketModal, getTicketCategory } from "../../../modules/tickets/ticketCategories";

module.exports = {
  customId: "ticket-category",

  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guild || !interaction.client.tickets) {
      await interaction.reply({ content: "The ticket system is not available right now.", flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = await interaction.client.tickets.findActiveForMember(interaction.guild.id, interaction.user.id);

    if (existing) {
      const destination = existing.channelId ? `<#${existing.channelId}>` : "being created";
      await interaction.reply({ content: `You already have an active ticket ${destination}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const category = getTicketCategory(interaction.values[0]);
    await interaction.showModal(buildTicketModal(category.value));
  },
};
