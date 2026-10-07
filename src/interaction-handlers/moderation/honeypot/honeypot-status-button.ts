import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";
import { handleHoneypotStatus } from "../../../modules/moderation/honeypot/honeypotStatus";

export class HoneypotStatusButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }
  public override parse(interaction: ButtonInteraction) { return interaction.customId === "honeypot:status" ? this.some() : this.none(); }
  protected override async handle(interaction: ButtonInteraction): Promise<void> { await handleHoneypotStatus(interaction); }
}
