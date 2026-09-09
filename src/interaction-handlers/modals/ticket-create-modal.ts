import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";

import { createTicket } from "../../modules/tickets/ticketService";
import { getTicketCategory } from "../../modules/tickets/ticketCategories";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
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

class TicketCreateModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return matchesCustomId(interaction.customId, handler.customId, handler.customIdPrefix) ? this.some() : this.none();
  }

  protected override handle(interaction: ModalSubmitInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { TicketCreateModal };
