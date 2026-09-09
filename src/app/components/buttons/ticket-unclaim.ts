import { ChannelType, MessageFlags, type ButtonInteraction } from "discord.js";

import { parseTicketId } from "../../../modules/tickets/ticketReview";
import { buildTicketCard } from "../../../modules/tickets/ticketService";
import { hasStaffRole } from "../../../shared/utils/staffAccess";

module.exports = {
  customId: "ticket-unclaim",
  customIdPrefix: "ticket-unclaim:",

  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticketId = parseTicketId(interaction.customId);
    const repository = interaction.client.tickets;

    if (!ticketId || !repository || !interaction.guild || interaction.channel?.type !== ChannelType.GuildText) {
      await interaction.editReply("This ticket assignment is no longer available.");
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasStaffRole(member)) {
      await interaction.editReply("Only configured staff members can release tickets.");
      return;
    }

    const current = await repository.findById(ticketId);
    if (!current || current.status !== "open" || current.channelId !== interaction.channelId) {
      await interaction.editReply("This ticket is closed or no longer available.");
      return;
    }

    if (current.claimedBy !== member.id) {
      await interaction.editReply(current.claimedBy ? `Only <@${current.claimedBy}> can release this ticket.` : "This ticket is not currently claimed.");
      return;
    }

    const released = await repository.unclaim(ticketId, member.id);
    if (!released) {
      await interaction.editReply("This ticket assignment changed before it could be released. Please try again.");
      return;
    }

    await interaction.message.edit({ components: [buildTicketCard(released)], allowedMentions: { parse: [] } });
    await interaction.editReply(`Ticket #${released.id} is now available for another staff member.`);
  },
};
