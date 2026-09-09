import { MessageFlags, type ModalSubmitInteraction } from "discord.js";

import { createTicket } from "../../../modules/tickets/ticketService";
import { getTicketCategory } from "../../../modules/tickets/ticketCategories";

module.exports = {
  customId: "ticket-create-modal",
  customIdPrefix: "ticket-create-modal:",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const category = getTicketCategory(interaction.customId.split(":", 2)[1]);
    const result = await createTicket(interaction, {
      subject: interaction.fields.getTextInputValue("ticket-subject").trim(),
      category: category.label,
      description: interaction.fields.getTextInputValue("ticket-description").trim(),
      stepsTried: interaction.fields.getTextInputValue("ticket-steps-tried").trim(),
      impact: interaction.fields.getTextInputValue("ticket-impact").trim(),
    });

    if (!result.created) {
      const destination = result.channel ? `<#${result.channel.id}>` : "still being created";
      await interaction.editReply(`You already have an active ticket ${destination}.`);
      return;
    }

    await interaction.editReply(`Ticket #${result.ticket.id} created: <#${result.channel?.id}>`);
  },
};
