import { LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from "discord.js";

import { parseTicketId } from "../../../modules/tickets/ticketReview";

module.exports = {
  customId: "ticket-review",
  customIdPrefix: "ticket-review:",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const ticketId = parseTicketId(interaction.customId);
    const repository = interaction.client.tickets;

    if (!ticketId || !repository) {
      await interaction.reply({ content: "This ticket review is no longer available.", flags: MessageFlags.Ephemeral });
      return;
    }

    const ticket = await repository.findById(ticketId);

    if (!ticket || ticket.openerId !== interaction.user.id || ticket.status !== "closed") {
      await interaction.reply({ content: "Only the creator of this closed ticket can review it.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (ticket.reviewedAt) {
      await interaction.reply({ content: "You already submitted a review for this ticket. Thank you!", flags: MessageFlags.Ephemeral });
      return;
    }

    const rating = new TextInputBuilder().setCustomId("ticket-review-rating").setStyle(TextInputStyle.Short).setPlaceholder("1, 2, 3, 4, or 5").setMinLength(1).setMaxLength(1).setRequired(true);
    const resolved = new TextInputBuilder().setCustomId("ticket-review-resolved").setStyle(TextInputStyle.Short).setPlaceholder("Yes or No").setMinLength(1).setMaxLength(3).setRequired(true);
    const comments = new TextInputBuilder().setCustomId("ticket-review-comments").setStyle(TextInputStyle.Paragraph).setPlaceholder("What went well, or what could we improve?").setMaxLength(2000).setRequired(false);

    const modal = new ModalBuilder()
      .setCustomId(`ticket-review-modal:${ticket.id}`)
      .setTitle(`Review Ticket #${ticket.id}`)
      .addLabelComponents(
        new LabelBuilder().setLabel("Rating from 1 to 5").setDescription("5 means excellent support.").setTextInputComponent(rating),
        new LabelBuilder().setLabel("Was your issue resolved?").setDescription('Enter "Yes" or "No".').setTextInputComponent(resolved),
        new LabelBuilder().setLabel("Additional comments").setDescription("Optional feedback for the staff team.").setTextInputComponent(comments),
      );

    await interaction.showModal(modal);
  },
};
