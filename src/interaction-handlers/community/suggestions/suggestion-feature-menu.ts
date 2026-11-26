import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { FEATURE_MENU_PATTERN, handleFeatureMenu } from "../../../modules/community/suggestions/suggestionInteractions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

class SuggestionFeatureMenu extends RateLimitedInteractionHandler<StringSelectMenuInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) { super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu }); }
  public override parse(interaction: StringSelectMenuInteraction) { return FEATURE_MENU_PATTERN.test(interaction.customId) ? this.some() : this.none(); }
  protected override handle(interaction: StringSelectMenuInteraction): Promise<void> { return handleFeatureMenu(interaction); }
}

export { SuggestionFeatureMenu };
