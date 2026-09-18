import { Command } from "@sapphire/framework";
import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";
import { runVoiceInteraction } from "../../../modules/voice/voiceInteractions";
import { VoiceUserError, type VoiceAction } from "../../../modules/voice/VoiceService";

export const voiceCommand = new SlashCommandBuilder().setName("voice").setDescription("Create and manage your temporary voice room.")
  .addSubcommand((sub) => sub.setName("setup").setDescription("Configure join-to-create rooms (Manage Server required).")
    .addChannelOption((option) => option.setName("join").setDescription("Voice channel members join to create a room").addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addChannelOption((option) => option.setName("category").setDescription("Category for temporary rooms").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addChannelOption((option) => option.setName("panel").setDescription("Text channel for owner controls").addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((sub) => sub.setName("panel").setDescription("Restore the control panel (Manage Server required)."))
  .addSubcommand((sub) => sub.setName("disable").setDescription("Stop new rooms; existing rooms keep working (Manage Server required)."))
  .addSubcommand((sub) => sub.setName("rename").setDescription("Rename the room you own and are currently in.")
    .addStringOption((option) => option.setName("name").setDescription("New room name").setMinLength(1).setMaxLength(100).setRequired(true)))
  .addSubcommand((sub) => sub.setName("limit").setDescription("Set your room's user limit.")
    .addIntegerOption((option) => option.setName("users").setDescription("0 for unlimited; maximum 99").setMinValue(0).setMaxValue(99).setRequired(true)));

for (const [name, description] of [
  ["lock", "Prevent new members from joining your room."], ["unlock", "Restore your room's original join permissions."],
  ["hide", "Hide your room from other members."], ["show", "Restore your room's original visibility."],
  ["delete", "Delete the room you own and disconnect its members."],
]) voiceCommand.addSubcommand((sub) => sub.setName(name).setDescription(description));

for (const [name, description] of [
  ["permit", "Allow a member to see and join your room."],
  ["reject", "Deny a member access and disconnect them from your room."],
  ["kick", "Disconnect a member currently in your room."],
]) voiceCommand.addSubcommand((sub) => sub.setName(name).setDescription(description)
  .addUserOption((option) => option.setName("member").setDescription("Member to manage").setRequired(true)));

export class VoiceCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "voice", description: "Create and manage temporary voice rooms.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, voiceCommand);
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await runVoiceInteraction(interaction, async (service) => {
      const action = interaction.options.getSubcommand();
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
