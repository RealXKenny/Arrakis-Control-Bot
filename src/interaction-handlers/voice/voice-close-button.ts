import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../support/interactions/RateLimitedInteractionHandler";
import { runVoiceInteraction } from "../../modules/voice/voiceInteractions";

export async function confirmVoiceClose(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  if (interaction.customId.startsWith("voice-cancel:")) {
    await interaction.editReply({ content: "Cancelled. No changes made.", components: [] });
    return;
  }
  await runVoiceInteraction(interaction, async (service) => {
    const [, roomId, panelId] = interaction.customId.split(":");
    const reset = interaction.customId.startsWith("voice-reset:");
    await service.control(interaction.guild!, interaction.user.id, reset ? "reset" : "delete", undefined, interaction.channelId, roomId, panelId);
    await interaction.editReply({ content: reset ? "Your room's default settings were restored. Individual member permissions were preserved." : "Your voice room was closed.", components: [] });
  });
}

export class VoiceCloseButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return /^voice-(close|cancel|reset):\d+:\d+$/.test(interaction.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ButtonInteraction): Promise<void> {
    return confirmVoiceClose(interaction);
  }
}
