import { MessageFlags, type ButtonInteraction } from "discord.js";

async function handleHoneypotStatus(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const service = interaction.client.honeypot;
  if (!service || interaction.guildId !== service.config.guildId || interaction.channelId !== service.config.channelId || interaction.message.author.id !== interaction.client.user?.id) {
    await interaction.editReply({ content: "This honeypot status control is no longer available here.", allowedMentions: { parse: [] } });
    return;
  }
  try {
    const stats = await service.stats();
    await interaction.editReply({ content: [
      "## Honeypot Status",
      `**Members caught:** ${stats.members}`,
      `**Triggering messages:** ${stats.messages}`,
      `**Successful bans:** ${stats.bans}`,
      `**Successful timeouts:** ${stats.timeouts}`,
      `**Log-only incidents:** ${stats.logged}`,
      `**Failed moderation actions:** ${stats.failed}`,
      service.persistentStats ? "Totals recorded since statistics were enabled for this channel; preserved across restarts." : "Totals since this restart. Configure DATABASE_URL to preserve them across restarts.",
      "Members caught counts distinct non-exempt members, including incidents where moderation failed. Clicking Status does not trigger the trap.",
    ].join("\n"), allowedMentions: { parse: [] } });
  } catch {
    await interaction.editReply({ content: "Honeypot statistics are temporarily unavailable. Try again later.", allowedMentions: { parse: [] } });
  }
}

export { handleHoneypotStatus };
