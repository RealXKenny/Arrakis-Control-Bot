import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";

import { ALL_CATEGORIES, renderMarketBrowser } from "../../../modules/market/marketBrowser";
import { getMarketSession } from "../../../modules/market/marketSessions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

const CUSTOM_ID = /^market-category:([A-Za-z0-9_-]+)$/;

async function execute(interaction: StringSelectMenuInteraction): Promise<void> {
  const match = interaction.customId.match(CUSTOM_ID);
  const session = match ? getMarketSession(match[1]) : null;

  if (!session) {
    await interaction.reply({ content: "This market browser has expired. Run `/market` to open a new one.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (session.ownerId !== interaction.user.id) {
    await interaction.reply({ content: "Only the member who opened this market browser can use its controls.", flags: MessageFlags.Ephemeral });
    return;
  }

  const selected = interaction.values[0];

  if (selected !== ALL_CATEGORIES && !session.categories.includes(selected)) {
    await interaction.reply({ content: "That market category is no longer available. Run `/market` to refresh the browser.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  session.category = selected === ALL_CATEGORIES ? undefined : selected;
  session.page = 1;
  await renderMarketBrowser(interaction, session);
}

class MarketCategoryMenu extends RateLimitedInteractionHandler<StringSelectMenuInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
  }

  public override parse(interaction: StringSelectMenuInteraction) {
    return CUSTOM_ID.test(interaction.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: StringSelectMenuInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { MarketCategoryMenu, execute };
