import { Command } from "@sapphire/framework";
import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerApplicationCommand } from "./registerApplicationCommand";
import { runVoiceInteraction } from "../../modules/voice/voiceInteractions";
import { VoiceUserError, type VoiceAction } from "../../modules/voice/VoiceService";
import { VOICE_COMMANDS, type VoiceCommandAction } from "../../modules/voice/voiceCommands";

export function voiceCommandDefinition(action: VoiceCommandAction) {
  const command = new SlashCommandBuilder().setName(`voice-${action}`).setDescription(VOICE_COMMANDS[action]);
  if (action === "setup") command
    .addChannelOption((option) => option.setName("join").setDescription("Voice channel members join to create a room").addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addChannelOption((option) => option.setName("category").setDescription("Category for temporary rooms").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addChannelOption((option) => option.setName("panel").setDescription("Text channel for owner controls").addChannelTypes(ChannelType.GuildText).setRequired(true));
  if (action === "rename") command.addStringOption((option) => option.setName("name").setDescription("New room name").setMinLength(1).setMaxLength(100).setRequired(true));
  if (action === "limit") command.addIntegerOption((option) => option.setName("users").setDescription("0 for unlimited; maximum 99").setMinValue(0).setMaxValue(99).setRequired(true));
  if (["permit", "reject", "kick"].includes(action)) command.addUserOption((option) => option.setName("member").setDescription("Member to manage").setRequired(true));
  return command;
}
export function createVoiceCommand(action: VoiceCommandAction) { return class VoiceCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: `voice-${action}`, description: VOICE_COMMANDS[action], preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, voiceCommandDefinition(action));
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await runVoiceInteraction(interaction, async (service) => {

      if (["setup", "panel", "disable"].includes(action)) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new VoiceUserError("Manage Server permission is required for voice setup.");
        if (action === "setup") {
          await service.setup(interaction.guild!, interaction.options.getChannel("join", true).id, interaction.options.getChannel("category", true).id, interaction.options.getChannel("panel", true).id);
        } else if (action === "panel") await service.panel(interaction.guild!);
        else await service.disable(interaction.guildId!);
        await interaction.editReply(action === "disable" ? "New voice-room creation is disabled. Existing rooms and owner controls remain active until the rooms are empty." : "Voice-room configuration and control panel are ready.");
        return;
      }
      const value = action === "rename" ? interaction.options.getString("name", true)
        : action === "limit" ? String(interaction.options.getInteger("users", true))
          : ["permit", "reject", "kick"].includes(action) ? interaction.options.getUser("member", true).id : undefined;
      await service.control(interaction.guild!, interaction.user.id, action as VoiceAction, value);
      await interaction.editReply(action === "delete" ? "Your voice room was deleted." : "Your voice room was updated.");
    });
  }
}
}
