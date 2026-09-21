import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import { isUnknownInteractionError } from "../../support/interactions/interactionResponses";
import type { MusicInteractionRecord } from "../audit/DiscordAuditLogger";
import type { MusicAction } from "./MusicService";

export async function handleMusicInteraction(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  const service = interaction.client.music;
  const type = interaction.customId;
  const audit: MusicInteractionRecord = { action: describeMusicAction(type), status: "Succeeded", outcome: "Completed." };
  try {
    if (!service || !interaction.guild || !interaction.channelId) {
      audit.status = "Rejected";
      audit.outcome = "Music is not configured for this server or channel.";
      await interaction.reply({ content: "Music is not configured here.", flags: MessageFlags.Ephemeral });
      return;
    }
    const [, action] = interaction.customId.split(":");
    if (interaction.isButton() && (action === "request" || action === "volume")) {
      const input = new TextInputBuilder().setCustomId("value").setStyle(TextInputStyle.Short).setRequired(true)
        .setLabel(action === "request" ? "Song and artist, or supported link" : "Volume (0–100)").setMaxLength(action === "request" ? 500 : 3);
      await interaction.showModal(new ModalBuilder().setCustomId(`music-edit:${action}`).setTitle(action === "request" ? "Request a Song" : "Music Volume")
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
      audit.outcome = action === "request" ? "Opened the song request form." : "Opened the volume form.";
      return;
    }
    // Dev note: Acknowledge before the slow verse; Discord's three-second hook waits for no chorus.
    if (interaction.isButton() && (interaction.customId.startsWith("music-confirm:") || interaction.customId.startsWith("music:lyrics:") || action === "cancel")) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await service.authorize(interaction.guild, interaction.channelId, interaction.user.id, !["queue", "now", "lyrics", "cancel"].includes(action));
    let content: string;
    if (interaction.isModalSubmit()) {
      const value = interaction.fields.getTextInputValue("value").trim();
      audit.input = value;
      if (action === "request") content = await service.request(interaction.guild, interaction.channelId, interaction.user.id, value);
      else {
        await service.action(interaction.guild, interaction.channelId, interaction.user.id, "volume", /^\d{1,3}$/.test(value) ? Number(value) : NaN);
        content = `Volume set to ${value}%.`;
      }
    } else if (action === "lyrics") {
      const [, , requestId, page] = interaction.customId.split(":");
      await interaction.editReply(await service.lyricsMessage(requestId, page === undefined ? 0 : Number(page)));
      audit.outcome = `Displayed lyrics page ${page === undefined ? 1 : Number(page) + 1}.`;
      return;
    } else if (action === "now") {
      await interaction.editReply(service.nowPlayingMessage());
      audit.outcome = "Displayed the current track.";
      return;
    } else if (action === "queue") {
      content = service.describeQueue();
      audit.outcome = "Displayed the current song queue.";
    }
    else if (action === "cancel") content = "Cancelled. Playback is unchanged.";
    else if ((action === "stop" || action === "clear") && !interaction.customId.startsWith("music-confirm:")) {
      await service.requireOwnerRole(interaction.guild, interaction.user.id);
      await interaction.editReply({ content: action === "stop" ? "Stop requested playback, remove every queued song, and return to waiting music?" : "Remove all upcoming songs? The current song will keep playing.",
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`music-confirm:${action}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("music:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary))] });
      audit.outcome = action === "stop" ? "Displayed the stop-playback confirmation." : "Displayed the clear-queue confirmation.";
      return;
    } else {
      await service.action(interaction.guild, interaction.channelId, interaction.user.id, action as MusicAction);
      content = action === "stop" ? "Requested playback stopped and the queue was cleared. Waiting music has resumed." : "Music controls updated.";
    }
    if (action !== "queue") audit.outcome = content;
    await interaction.editReply({ content, components: [], allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    if (isUnknownInteractionError(error)) {
      audit.status = "Expired";
      audit.outcome = "Discord rejected the expired interaction token; no response could be sent.";
      return;
    }
    const content = service?.errorMessage(error) ?? "Music is temporarily unavailable.";
    audit.status = "Rejected";
    audit.outcome = content;
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (responseError: unknown) {
      if (!isUnknownInteractionError(responseError)) throw responseError;
    }
  } finally {
    let snapshot;
    // Dev note: The audit camera may miss a frame, but it never gets to stop the concert.
    try { snapshot = service?.auditSnapshot(); } catch { /* Audit context must never break a music control. */ }
    await interaction.client.auditLogger?.musicInteraction(interaction, type, audit, snapshot);
  }
}

function describeMusicAction(customId: string): string {
  if (customId === "music:request") return "Open song request form";
  if (customId === "music-edit:request") return "Submit song request";
  if (customId === "music:queue") return "View song queue";
  if (customId === "music:now") return "View current track";
  if (customId.startsWith("music:lyrics")) return "View lyrics";
  if (customId === "music:volume") return "Open volume form";
  if (customId === "music-edit:volume") return "Set playback volume";
  if (customId.startsWith("music-confirm:")) return `Confirm ${customId.slice("music-confirm:".length)}`;
  if (customId === "music:cancel") return "Cancel pending music action";
  return customId.startsWith("music:") ? customId.slice("music:".length).replaceAll("-", " ") : customId;
}
