import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction, type UserSelectMenuInteraction, type StringSelectMenuInteraction } from "discord.js";
import { VoiceUserError, type VoiceService } from "./VoiceService";

type VoiceInteraction = ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction | UserSelectMenuInteraction | StringSelectMenuInteraction;

export async function runVoiceInteraction(interaction: VoiceInteraction, work: (service: VoiceService) => Promise<void>): Promise<void> {
  try {
    if (!interaction.guild) throw new VoiceUserError("Voice rooms can only be managed inside a server.");
    const service = interaction.client.voiceRooms;
    if (!service) throw new VoiceUserError("Voice rooms require DATABASE_URL and a bot restart before setup.");
    await work(service);
  } catch (error) {
    if (!(error instanceof VoiceUserError)) interaction.client.logger.error("Voice room operation failed.", error);
    const content = error instanceof VoiceUserError ? error.message : "I couldn't complete that voice-room action. Check the bot's channel permissions and try again.";
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
