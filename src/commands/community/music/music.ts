import { Command } from "@sapphire/framework";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";
import type { MusicAction } from "../../../modules/music/MusicService";

export const musicCommand = new SlashCommandBuilder().setName("music").setDescription("Request songs and control the music lounge.")
  .addSubcommand((sub) => sub.setName("play").setDescription("Queue a song or playlist in the music lounge.")
    .addStringOption((option) => option.setName("query").setDescription("Song name or supported HTTPS link").setMaxLength(500).setRequired(true)))
  .addSubcommand((sub) => sub.setName("volume").setDescription("Set the music lounge volume.")
    .addIntegerOption((option) => option.setName("level").setDescription("Volume from 0 to 100").setMinValue(0).setMaxValue(100).setRequired(true)));

for (const [name, description] of [
  ["panel", "Publish or refresh the music control panel (Manage Server)."],
  ["queue", "Show the current song and upcoming requests."], ["now", "Show the current song."],
  ["skip", "Skip the current song."], ["pause", "Pause playback."], ["resume", "Resume playback."],
  ["stop", "Stop playback and clear the queue; remain in voice."], ["clear", "Clear upcoming songs without stopping the current song."],
]) musicCommand.addSubcommand((sub) => sub.setName(name).setDescription(description));

export class MusicCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "music", description: "Request music and manage the lounge queue.", preconditions: ["InteractionRateLimit"] });
  }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, musicCommand); }
  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const service = interaction.client.music;
    if (!service || !interaction.guild) {
      await interaction.editReply("Music is not configured here. Fill in the Lavalink and music channel settings, then restart the bot.");
      return;
    }
    try {
      const action = interaction.options.getSubcommand();
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
