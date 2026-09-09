import { InteractionHandler } from "@sapphire/framework";
import { MessageFlags, type AnySelectMenuInteraction, type ButtonInteraction, type Interaction, type ModalSubmitInteraction } from "discord.js";

type SupportedInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

abstract class RateLimitedInteractionHandler<TInteraction extends SupportedInteraction> extends InteractionHandler {
  public override async run(interaction: Interaction): Promise<void> {
    const componentInteraction = interaction as TInteraction;
    const key = `${componentInteraction.user.id}:${componentInteraction.customId}`;

    if (!this.container.client.interactionRateLimiter.allow(key)) {
      await respondWithRateLimit(componentInteraction);
      return;
    }

    await this.handle(componentInteraction);
  }

  protected abstract handle(interaction: TInteraction): Promise<void>;
}

async function respondWithRateLimit(interaction: SupportedInteraction): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content: "Please wait a moment before trying that again." });
  } else if (interaction.replied) {
    await interaction.followUp({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });
  }
}

export { RateLimitedInteractionHandler, respondWithRateLimit };
export type { SupportedInteraction };
