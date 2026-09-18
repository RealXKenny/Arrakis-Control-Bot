import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../support/interactions/RateLimitedInteractionHandler";
import { runVoiceInteraction } from "../../modules/voice/voiceInteractions";

export class VoiceModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return /^voice-edit:(rename|limit):\d+$/.test(interaction.customId) ? this.some() : this.none();
  }

  protected override async handle(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await runVoiceInteraction(interaction, async (service) => {
      const [, action, channelId] = interaction.customId.split(":");
      await service.control(interaction.guild!, interaction.user.id, action as "rename" | "limit", interaction.fields.getTextInputValue("value"), interaction.channelId ?? undefined, channelId, interaction.message?.id);
      await interaction.editReply("Your voice room was updated.");
    });
  }
}
