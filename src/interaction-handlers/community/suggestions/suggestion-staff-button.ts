import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { STAFF_STATUS_PATTERN, handleStaffStatusButton } from "../../../modules/community/suggestions/suggestionInteractions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

class SuggestionStaffButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) { super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button }); }
  public override parse(interaction: ButtonInteraction) { return STAFF_STATUS_PATTERN.test(interaction.customId) ? this.some() : this.none(); }
  protected override handle(interaction: ButtonInteraction): Promise<void> { return handleStaffStatusButton(interaction); }
}

export { SuggestionStaffButton };
