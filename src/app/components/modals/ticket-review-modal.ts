import { MessageFlags, type ModalSubmitInteraction } from "discord.js";

import { TicketReviewValidationError, parseTicketId, parseTicketReview, publishTicketReview } from "../../../modules/tickets/ticketReview";

module.exports = {
  customId: "ticket-review-modal",
  customIdPrefix: "ticket-review-modal:",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticketId = parseTicketId(interaction.customId);
    const repository = interaction.client.tickets;

    if (!ticketId || !repository) {
      await interaction.editReply("This ticket review is no longer available.");
      return;
    }

    try {
      const review = parseTicketReview(
        interaction.fields.getTextInputValue("ticket-review-rating"),
        interaction.fields.getTextInputValue("ticket-review-resolved"),
        interaction.fields.getTextInputValue("ticket-review-comments"),
      );
      const ticket = await repository.submitReview(ticketId, interaction.user.id, review);

      if (!ticket) {
        await interaction.editReply("This review was already submitted, or this ticket does not belong to you.");
        return;
      }

      await publishTicketReview(interaction.client, ticket);
      await interaction.editReply(`Thank you! Your ${review.rating}/5 review for ticket #${ticket.id} has been saved.`);
    } catch (error) {
      if (error instanceof TicketReviewValidationError) {
        await interaction.editReply(error.message);
        return;
      }

      throw error;
    }
  },
};
