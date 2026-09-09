import { ChannelType, MessageFlags, type ButtonInteraction } from "discord.js";

import { parseTicketId } from "../../../modules/tickets/ticketReview";
import { buildTicketCard } from "../../../modules/tickets/ticketService";
import { hasStaffRole } from "../../../shared/utils/staffAccess";

module.exports = {
  customId: "ticket-claim",
  customIdPrefix: "ticket-claim:",

  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticketId = parseTicketId(interaction.customId);
    const repository = interaction.client.tickets;

    if (!ticketId || !repository || !interaction.guild || interaction.channel?.type !== ChannelType.GuildText) {
      await interaction.editReply("This ticket claim is no longer available.");
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasStaffRole(member)) {
      await interaction.editReply("Only configured staff members can claim tickets.");
      return;
    }

    const current = await repository.findById(ticketId);
    if (!current || current.status !== "open" || current.channelId !== interaction.channelId) {
      await interaction.editReply("This ticket is closed or no longer available.");
      return;
    }

    const claimed = await repository.claim(ticketId, member.id);
    if (!claimed) {
      const latest = await repository.findById(ticketId);
      await interaction.editReply(latest?.claimedBy ? `This ticket is already claimed by <@${latest.claimedBy}>.` : "This ticket could not be claimed.");
      return;
    }

    await interaction.message.edit({ components: [buildTicketCard(claimed)], allowedMentions: { parse: [] } });
    await interaction.editReply(`You are now handling ticket #${claimed.id}.`);
  },
};
