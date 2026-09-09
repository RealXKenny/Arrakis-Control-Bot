import { ChannelType, MessageFlags, type ButtonInteraction } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";
import { TicketClaimedByAnotherStaffError, TicketPermissionError, closeTicket } from "../../../modules/tickets/ticketService";

const logger = createLogger("TICKET CLOSE");

module.exports = {
  customId: "ticket-close",

  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "This button can only be used inside a ticket channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await closeTicket(interaction.channel, member);

      if (!result) {
        await interaction.editReply("This ticket is already closed or is not registered.");
        return;
      }

      const dmStatus = result.dmSent ? " The creator received the full closure details, transcript, and review request by DM." : " The creator's DMs are unavailable, so the private closure receipt could not be delivered.";
      await interaction.editReply(`Ticket #${result.ticket.id} has been closed and its transcript was saved.${dmStatus} This channel will now be deleted.`);

      try {
        await interaction.channel.delete(`Ticket #${result.ticket.id} closed by ${member.user.tag}`);
      } catch (error) {
        logger.error(`Ticket #${result.ticket.id} closed, but channel ${interaction.channel.id} could not be deleted.`, error);

        await interaction.followUp({
          content: "The transcript was saved, but Discord could not delete this channel automatically. Staff can delete it manually.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      if (error instanceof TicketPermissionError || error instanceof TicketClaimedByAnotherStaffError) {
        await interaction.editReply(error.message);
        return;
      }

      throw error;
    }
  },
};
