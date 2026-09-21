import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";

import { handleBotControl } from "../../../modules/administration/control/botControlActions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

export class BotControlButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return interaction.customId.startsWith("bot-control:") ? this.some() : this.none();
  }

  protected override async handle(interaction: ButtonInteraction): Promise<void> {
    await handleBotControl(interaction);
  }
}
