import { container } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Client,
} from "discord.js";

import { reloadPieces } from "../../../command-actions/administration/operations/reload";
import { refreshPersistentPanels } from "./panelRefresh";

function canControlBot(interaction: ButtonInteraction): boolean {
  if (!interaction.guild || interaction.user.id === interaction.guild.ownerId) return Boolean(interaction.guild);
  const ownerRoleId = process.env.OWNER_ROLE_ID?.trim();
  if (!ownerRoleId) return false;
  const roles = interaction.member?.roles;
  return Array.isArray(roles) ? roles.includes(ownerRoleId) : Boolean(roles?.cache.has(ownerRoleId));
}

async function handleBotControl(interaction: ButtonInteraction): Promise<void> {
  if (!canControlBot(interaction)) {
    await interaction.reply({ content: "Only the Discord server owner or configured Owner role can use the bot control center.", flags: MessageFlags.Ephemeral });
    return;
  }

  const action = interaction.customId.slice("bot-control:".length);
  if (action === "restart") {
    await interaction.reply({
      content: "Restart every bot shard? Discord controls will be unavailable briefly while the process reconnects.",
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("bot-control:restart-confirm").setLabel("Restart Bot").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("bot-control:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      )],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (action === "cancel") {
    await interaction.update({ content: "Bot restart cancelled.", components: [], allowedMentions: { parse: [] } });
    return;
  }

  if (action === "restart-confirm") {
    if (!interaction.client.shard) {
      await interaction.update({ content: "A managed shard process is required for a safe in-app restart.", components: [], allowedMentions: { parse: [] } });
      return;
    }
    await interaction.update({ content: "Restart accepted. Arrakis Control will reconnect shortly.", components: [], allowedMentions: { parse: [] } });
    await auditControlAction(interaction, "Restart all bot shards");
    // Dev note: Give Discord the receipt before pulling the ornithopter's ignition switch.
    setTimeout(() => { void interaction.client.shard?.respawnAll().catch(() => undefined); }, 1_000);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let outcome: string;
  switch (action) {
    case "status":
      outcome = botStatus(interaction.client);
      break;
    case "refresh-panels": {
      const results = await refreshPersistentPanels(interaction.client, interaction.guild ?? undefined);
      const updated = results.filter((result) => result.status === "updated");
      const failed = results.filter((result) => result.status === "failed");
      outcome = `Updated ${updated.length} persistent panel${updated.length === 1 ? "" : "s"}.`;
      if (failed.length) outcome += `\n\n⚠️ ${failed.map((result) => `${result.label}: ${result.error ?? "unknown error"}`).join("\n⚠️ ")}`;
      break;
    }
    case "reload": {
      const commands = await reloadPieces(container.stores.get("commands").values());
      const components = await reloadPieces(container.stores.get("interaction-handlers").values());
      outcome = `Reloaded ${commands} command pieces and ${components} component handlers.`;
      break;
    }
    case "resync":
      outcome = await resyncRuntimeServices(interaction.client);
      break;
    default:
      outcome = "That control action is no longer available. Refresh the control panel and try again.";
  }

  await interaction.editReply({ content: outcome, allowedMentions: { parse: [] } });
  await auditControlAction(interaction, `${action}: ${outcome.slice(0, 500)}`);
}

function botStatus(client: Client): string {
  const music = client.music?.auditSnapshot();
  const services = [
    `Discord gateway: ${client.isReady() ? "✅ ready" : "⚠️ reconnecting"} · ${Math.max(0, client.ws.ping)} ms`,
    `Database: ${client.tickets ? "✅ configured" : "➖ disabled"}`,
    `Player links: ${client.discordAdapter ? "✅ enabled" : "➖ disabled"}`,
    `Game chat: ${client.chatBridge ? "✅ enabled" : "➖ disabled"}`,
    `Voice rooms: ${client.voiceRooms ? "✅ enabled" : "➖ disabled"}`,
    `Music: ${music ? `${music.available ? "✅ Lavalink ready" : "⚠️ Lavalink unavailable"} · ${music.connected ? "voice connected" : "voice idle"}` : "➖ disabled"}`,
    `Leveling: ${client.leveling ? "✅ enabled" : "➖ disabled"}`,
  ];
  return `**Arrakis Control status**\n${services.join("\n")}\nUptime: ${formatUptime(client.uptime ?? 0)} · Guilds: ${client.guilds.cache.size}`;
}

async function resyncRuntimeServices(client: Client): Promise<string> {
  const completed: string[] = [];
  if (client.chatBridge) {
    await client.chatBridge.stop();
    client.chatBridge.start();
    completed.push("game chat");
  }
  if (client.voiceRooms) {
    await client.voiceRooms.stop();
    await client.voiceRooms.start();
    completed.push("voice rooms");
  }
  if (client.leveling) {
    client.leveling.stop();
    client.leveling.start();
    completed.push("leveling timers");
  }
  if (client.music) {
    await client.music.publishPanel();
    completed.push("music controls");
  }
  return completed.length ? `Resynchronized ${completed.join(", ")}.` : "No optional runtime services are enabled.";
}

async function auditControlAction(interaction: ButtonInteraction, outcome: string): Promise<void> {
  await interaction.client.auditLogger?.send("Bot control action", [
    `**Operator:** ${interaction.user.tag} (${interaction.user.id})`,
    `**Guild:** ${interaction.guild?.name ?? "Unknown"} (${interaction.guildId ?? "Unknown"})`,
    `**Action:** ${outcome}`,
  ]);
}

function formatUptime(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days}d` : null, hours ? `${hours}h` : null, `${minutes}m`].filter(Boolean).join(" ");
}

export { botStatus, canControlBot, handleBotControl, resyncRuntimeServices };
