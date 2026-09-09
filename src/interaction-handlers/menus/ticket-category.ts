import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";

import { buildTicketModal, getTicketCategory } from "../../modules/tickets/ticketCategories";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
  customId: "ticket-category",

  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    const { tickets } = container.client;

    if (!interaction.guild || !tickets) {
      await interaction.reply({ content: "The ticket system is not available right now.", flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = await tickets.findActiveForMember(interaction.guild.id, interaction.user.id);

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
