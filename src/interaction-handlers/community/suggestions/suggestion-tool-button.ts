import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { handleToolButton } from "../../../modules/community/suggestions/suggestionInteractions";
import { SIMILAR_BUTTON_ID, SUMMARY_BUTTON_ID } from "../../../modules/community/suggestions/suggestionPanels";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

class SuggestionToolButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) { super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button }); }
  public override parse(interaction: ButtonInteraction) { return interaction.customId === SUMMARY_BUTTON_ID || interaction.customId === SIMILAR_BUTTON_ID ? this.some() : this.none(); }
  protected override handle(interaction: ButtonInteraction): Promise<void> { return handleToolButton(interaction, interaction.customId === SUMMARY_BUTTON_ID ? "summary" : "similar"); }
}

export { SuggestionToolButton };
