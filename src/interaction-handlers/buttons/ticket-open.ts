import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { MessageFlags, type ButtonInteraction } from "discord.js";

import { buildTicketModal } from "../../modules/tickets/ticketCategories";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
  customId: "ticket-open",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const { tickets } = container.client;

    if (!interaction.guild || !tickets) {
      await interaction.reply({
        content: "The ticket system is not available right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await tickets.findActiveForMember(interaction.guild.id, interaction.user.id);

    if (existing) {
      const destination = existing.channelId ? `<#${existing.channelId}>` : "being created";
      await interaction.reply({
        content: `You already have an active ticket ${destination}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(buildTicketModal("general-other"));
  },
};

class TicketOpenButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ButtonInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { TicketOpenButton };
