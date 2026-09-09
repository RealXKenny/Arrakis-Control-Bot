import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";

import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { isKnownComponentInteraction } from "../../support/componentCustomIds";
import { respondWithUnavailableControl } from "./unavailable";

class UnavailableModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return isKnownComponentInteraction(interaction) ? this.none() : this.some();
  }

  protected override async handle(interaction: ModalSubmitInteraction): Promise<void> {
    this.container.logger.warn(`No modal form handler registered for ${interaction.customId}.`);
    await respondWithUnavailableControl(interaction);
  }
}

export { UnavailableModal };
