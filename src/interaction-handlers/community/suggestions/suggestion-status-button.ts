import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { STATUS_BUTTON_PATTERN, handleStatusButton } from "../../../modules/community/suggestions/suggestionInteractions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

class SuggestionStatusButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) { super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button }); }
  public override parse(interaction: ButtonInteraction) { return STATUS_BUTTON_PATTERN.test(interaction.customId) ? this.some() : this.none(); }
  protected override handle(interaction: ButtonInteraction): Promise<void> { return handleStatusButton(interaction); }
}

export { SuggestionStatusButton };
