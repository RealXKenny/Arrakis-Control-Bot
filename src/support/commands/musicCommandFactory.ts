import { Command } from "@sapphire/framework";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { registerApplicationCommand } from "./registerApplicationCommand";
import type { MusicAction } from "../../modules/music/MusicService";
import { MUSIC_COMMANDS, type MusicCommandName } from "../../modules/music/musicCommands";

export function musicCommandDefinition(name: MusicCommandName) {
  const command = new SlashCommandSubcommandBuilder().setName(name === "music-panel" ? "panel" : name).setDescription(MUSIC_COMMANDS[name]);
  if (name === "play") command.addStringOption((option) => option.setName("query").setDescription("Song name or supported HTTPS link").setMaxLength(500).setRequired(true));
  if (name === "volume") command.addIntegerOption((option) => option.setName("level").setDescription("Volume from 0 to 100").setMinValue(0).setMaxValue(100).setRequired(true));
  return command;
}
export function musicGroupDefinition() {
  const command = new SlashCommandBuilder().setName("music").setDescription("Music requests, playback and controls.");
  for (const name of Object.keys(MUSIC_COMMANDS) as MusicCommandName[]) command.addSubcommand(musicCommandDefinition(name));
  return command;
}
export function createMusicCommand() { return class MusicCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "music", description: "Music requests, playback and controls.", preconditions: ["InteractionRateLimit"] });
  }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, musicGroupDefinition()); }
  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const service = interaction.client.music;
    if (!service || !interaction.guild) {
      await interaction.editReply("Music is not configured here. Fill in the Lavalink and music channel settings, then restart the bot.");
      return;
    }
    try {
      const action = interaction.options.getSubcommand(true);
      let content: string;
      if (action === "panel") {
        await service.authorize(interaction.guild, interaction.channelId, interaction.user.id, false);
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.editReply("You need Manage Server to publish the music panel.");
          return;
        }
        await service.publishPanel();
        content = "Music control panel updated.";
      } else if (action === "queue" || action === "now") {
        await service.authorize(interaction.guild, interaction.channelId, interaction.user.id, false);
        if (action === "now") {
          await interaction.editReply(service.nowPlayingMessage());
          return;
        }
        content = service.describeQueue();
      } else if (action === "play") {
        content = await service.request(interaction.guild, interaction.channelId, interaction.user.id, interaction.options.getString("query", true));
      } else {
        await service.action(interaction.guild, interaction.channelId, interaction.user.id, action as MusicAction, action === "volume" ? interaction.options.getInteger("level", true) : undefined);
        content = action === "stop" ? "Playback stopped and the queue was cleared. I'm staying in the music channel." : "Music controls updated.";
      }
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
    } catch (error) { await interaction.editReply(service.errorMessage(error)); }
  }
}
}
