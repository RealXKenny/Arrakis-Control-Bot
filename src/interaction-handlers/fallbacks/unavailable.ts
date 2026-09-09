import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type AnySelectMenuInteraction, type ButtonInteraction, type Interaction, type ModalSubmitInteraction } from "discord.js";

import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { isKnownComponentInteraction } from "../../support/componentCustomIds";
const UNAVAILABLE_MESSAGE = "This control is no longer available. Please use the latest bot panel and try again.";

type SupportedMessageComponent = ButtonInteraction | AnySelectMenuInteraction;
type UnavailableInteraction = SupportedMessageComponent | ModalSubmitInteraction;

async function respondWithUnavailableControl(interaction: UnavailableInteraction): Promise<void> {
  await interaction.reply({ content: UNAVAILABLE_MESSAGE, flags: MessageFlags.Ephemeral });
}

class UnavailableMessageComponent extends RateLimitedInteractionHandler<SupportedMessageComponent> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.MessageComponent });
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isButton() && !interaction.isAnySelectMenu()) return this.none();
    return isKnownComponentInteraction(interaction) ? this.none() : this.some();
  }

  protected override async handle(interaction: SupportedMessageComponent): Promise<void> {
    const label = interaction.isButton() ? "button" : "select menu";
    this.container.logger.warn(`No ${label} handler registered for ${interaction.customId}.`);
    await respondWithUnavailableControl(interaction);
  }
}

export { UNAVAILABLE_MESSAGE, UnavailableMessageComponent, respondWithUnavailableControl };
