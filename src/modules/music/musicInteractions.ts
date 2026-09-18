import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import type { MusicAction } from "./MusicService";

export async function handleMusicInteraction(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  const service = interaction.client.music;
  try {
    if (!service || !interaction.guild || !interaction.channelId) {
      await interaction.reply({ content: "Music is not configured here.", flags: MessageFlags.Ephemeral });
      return;
    }
    const [, action] = interaction.customId.split(":");
    if (interaction.isButton() && (action === "request" || action === "volume")) {
      await service.authorize(interaction.guild, interaction.channelId, interaction.user.id);
      if (action === "volume") service.requireRequester(interaction.user.id);
      const input = new TextInputBuilder().setCustomId("value").setStyle(TextInputStyle.Short).setRequired(true)
        .setLabel(action === "request" ? "Song and artist, or supported link" : "Volume (0–100)").setMaxLength(action === "request" ? 500 : 3);
      await interaction.showModal(new ModalBuilder().setCustomId(`music-edit:${action}`).setTitle(action === "request" ? "Request a Song" : "Music Volume")
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
      return;
    }
    if (interaction.isButton() && (interaction.customId.startsWith("music-confirm:") || action === "cancel")) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await service.authorize(interaction.guild, interaction.channelId, interaction.user.id, !["queue", "now", "lyrics", "cancel"].includes(action));
    let content: string;
    if (interaction.isModalSubmit()) {
      const value = interaction.fields.getTextInputValue("value").trim();
      if (action === "request") content = await service.request(interaction.guild, interaction.channelId, interaction.user.id, value);
      else {
        await service.action(interaction.guild, interaction.channelId, interaction.user.id, "volume", /^\d{1,3}$/.test(value) ? Number(value) : NaN);
        content = `Volume set to ${value}%.`;
      }
    } else if (action === "lyrics") {
      await interaction.editReply(service.lyricsMessage());
      return;
    } else if (action === "now") {
      await interaction.editReply(service.nowPlayingMessage());
      return;
    } else if (action === "queue") content = service.describeQueue();
    else if (action === "cancel") content = "Cancelled. Playback is unchanged.";
    else if ((action === "stop" || action === "clear") && !interaction.customId.startsWith("music-confirm:")) {
      await service.requireOwnerRole(interaction.guild, interaction.user.id);
      await interaction.editReply({ content: action === "stop" ? "Stop playback and remove every queued song?" : "Remove all upcoming songs? The current song will keep playing.",
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`music-confirm:${action}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("music:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary))] });
      return;
    } else {
      await service.action(interaction.guild, interaction.channelId, interaction.user.id, action as MusicAction);
      content = action === "stop" ? "Playback stopped and the queue was cleared. I'm staying in voice." : "Music controls updated.";
    }
    await interaction.editReply({ content, components: [], allowedMentions: { parse: [] } });
  } catch (error) {
    const content = service?.errorMessage(error) ?? "Music is temporarily unavailable.";
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
