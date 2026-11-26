import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";

import { buildTicketModal, getTicketCategory } from "../../../modules/tickets/ticketCategories";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";
import { PRE_ACKNOWLEDGEMENT_DEADLINE_MS, withDeadline } from "../../../shared/async/withDeadline";
import { matchesCustomId } from "../../../support/interactions/componentCustomIds";

const handler = {
  customId: "ticket-category",

  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    const { tickets } = container.client;

    if (!interaction.guild || !tickets) {
      await interaction.reply({ content: "The ticket system is not available right now.", flags: MessageFlags.Ephemeral });
      return;
    }

    // The modal cannot be deferred. If this pre-check is slow, the ticket service repeats it on submit.
    const existing = await withDeadline(tickets.findActiveForMember(interaction.guild.id, interaction.user.id), PRE_ACKNOWLEDGEMENT_DEADLINE_MS).catch(() => null);

    if (existing) {
      const destination = existing.channelId ? `<#${existing.channelId}>` : "being created";
      await interaction.reply({ content: `You already have an active ticket ${destination}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const category = getTicketCategory(interaction.values[0]);
    await interaction.showModal(buildTicketModal(category.value));
  },
};

class TicketCategoryMenu extends RateLimitedInteractionHandler<StringSelectMenuInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
  }

  public override parse(interaction: StringSelectMenuInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: StringSelectMenuInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { TicketCategoryMenu };
