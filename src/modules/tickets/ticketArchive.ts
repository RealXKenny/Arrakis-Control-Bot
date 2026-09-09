import { AttachmentBuilder, ContainerBuilder, FileBuilder, MessageFlags, SeparatorSpacingSize, type Client, type TextChannel } from "discord.js";

import type { TicketRecord } from "../../infrastructure/database/TicketRepository";
import { createLogger } from "../../infrastructure/core/logger";

const logger = createLogger("TICKET ARCHIVE");

function buildTicketArchiveContainer(ticket: TicketRecord): ContainerBuilder {
  const handler = ticket.claimedBy ? `<@${ticket.claimedBy}>` : "No staff handler claimed";
  const closer = ticket.closedBy ? `<@${ticket.closedBy}>` : "Unknown";
  const review = ticket.reviewRating === null || ticket.reviewResolved === null
    ? "**Review:** Awaiting member feedback"
    : [
        `**Rating:** ${"⭐".repeat(ticket.reviewRating)} (${ticket.reviewRating}/5)`,
        `**Resolved:** ${ticket.reviewResolved ? "Yes" : "No"}`,
        `**Comments:** ${escapeDiscordText(ticket.reviewComment || "No comments provided")}`,
        `**Reviewed:** ${ticket.reviewedAt?.toISOString() ?? "Unknown"}`,
      ].join("\n");

  return new ContainerBuilder()
    .setAccentColor(ticket.reviewRating === null ? 0xc58b45 : ticket.reviewRating >= 4 ? 0x57f287 : ticket.reviewRating >= 3 ? 0xd2a85a : 0xed4245)
    .addTextDisplayComponents((text) => text.setContent(`## Ticket #${ticket.id} archive`))
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `**Status:** Closed`,
          `**Opened by:** <@${ticket.openerId}>`,
          `**Handled by:** ${handler}`,
          `**Closed by:** ${closer}`,
          `**Opened:** ${ticket.createdAt.toISOString()}`,
          `**Claimed:** ${ticket.claimedAt?.toISOString() ?? "Not claimed"}`,
          `**Closed:** ${ticket.closedAt?.toISOString() ?? "Unknown"}`,
        ].join("\n"),
      ),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "### Request",
          `**Category:** ${escapeDiscordText(ticket.category)}`,
          `**Subject:** ${escapeDiscordText(ticket.subject)}`,
          `**Description:** ${escapeDiscordText(ticket.description)}`,
          `**Steps tried:** ${escapeDiscordText(ticket.stepsTried || "None provided")}`,
          `**Impact:** ${escapeDiscordText(ticket.impact)}`,
        ].join("\n"),
      ),
    )
    .addTextDisplayComponents((text) => text.setContent(formatDuneSummary(ticket)))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`### Member review\n${review}`))
    .addFileComponents(new FileBuilder().setURL(`attachment://ticket-${ticket.id}-transcript.txt`), new FileBuilder().setURL(`attachment://ticket-${ticket.id}.json`));
}

function buildTicketJson(ticket: TicketRecord): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      ticket: {
        id: ticket.id,
        guildId: ticket.guildId,
        channelId: ticket.channelId,
        ticketMessageId: ticket.ticketMessageId,
        status: ticket.status,
        openerId: ticket.openerId,
        category: ticket.category,
        subject: ticket.subject,
        description: ticket.description,
        stepsTried: ticket.stepsTried,
        impact: ticket.impact,
        duneLookupStatus: ticket.duneLookupStatus,
        duneAccount: ticket.duneAccount,
        createdAt: ticket.createdAt.toISOString(),
        claimedBy: ticket.claimedBy,
        claimedAt: ticket.claimedAt?.toISOString() ?? null,
        closedBy: ticket.closedBy,
        closedAt: ticket.closedAt?.toISOString() ?? null,
        transcriptCreatedAt: ticket.transcriptCreatedAt?.toISOString() ?? null,
        transcriptMessageCount: ticket.transcriptMessageCount,
        transcript: ticket.transcript,
        review: ticket.reviewedAt
          ? {
              rating: ticket.reviewRating,
              resolved: ticket.reviewResolved,
              comment: ticket.reviewComment,
              reviewedAt: ticket.reviewedAt.toISOString(),
            }
          : null,
      },
    },
    null,
    2,
  );
}

async function publishTicketArchive(ticketChannel: TextChannel, ticket: TicketRecord): Promise<TicketRecord> {
  const repository = ticketChannel.client.tickets;
  const archiveChannelId = ticketChannel.client.discordTicketTranscriptChannelId;

  if (!repository || !archiveChannelId) return ticket;
  if (archiveChannelId === ticketChannel.id) {
    logger.warn("TICKET_TRANSCRIPT_CHANNEL_ID cannot point to the ticket channel being deleted.");
    return ticket;
  }

  try {
    const channel = await ticketChannel.client.channels.fetch(archiveChannelId);
    if (!channel?.isSendable()) throw new Error(`Transcript channel ${archiveChannelId} is not sendable.`);

    const message = await channel.send({
      components: [buildTicketArchiveContainer(ticket)],
      files: createArchiveFiles(ticket),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    return await repository.setArchiveMessage(ticket.id, archiveChannelId, message.id);
  } catch (error) {
    logger.warn(`Ticket #${ticket.id} was saved to PostgreSQL, but its Discord archive could not be posted: ${error instanceof Error ? error.message : String(error)}`);
    return ticket;
  }
}

async function updateTicketArchive(client: Client, ticket: TicketRecord): Promise<void> {
  if (!ticket.archiveChannelId || !ticket.archiveMessageId) {
    logger.warn(`Ticket #${ticket.id} review was saved, but no Discord archive message is recorded.`);
    return;
  }

  try {
    const channel = await client.channels.fetch(ticket.archiveChannelId);
    if (!channel?.isTextBased()) throw new Error(`Archive channel ${ticket.archiveChannelId} is not text based.`);

    const message = await channel.messages.fetch(ticket.archiveMessageId);
    const retainedAttachments = [...message.attachments.values()]
      .filter((attachment) => attachment.name === `ticket-${ticket.id}-transcript.txt`)
      .map((attachment) => ({ id: attachment.id }));

    await message.edit({
      components: [buildTicketArchiveContainer(ticket)],
      files: [createJsonFile(ticket)],
      attachments: retainedAttachments,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger.warn(`Ticket #${ticket.id} review was saved, but its Discord archive could not be updated: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createArchiveFiles(ticket: TicketRecord): AttachmentBuilder[] {
  return [
    new AttachmentBuilder(Buffer.from(ticket.transcript ?? "Transcript unavailable", "utf8"), { name: `ticket-${ticket.id}-transcript.txt` }),
    createJsonFile(ticket),
  ];
}

function createJsonFile(ticket: TicketRecord): AttachmentBuilder {
  return new AttachmentBuilder(Buffer.from(buildTicketJson(ticket), "utf8"), {
    name: `ticket-${ticket.id}.json`,
    description: `Structured record for support ticket #${ticket.id}`,
  });
}

function formatDuneSummary(ticket: TicketRecord): string {
  if (!ticket.duneAccount) return `### Linked Dune account\n${ticket.duneLookupStatus === "unlinked" ? "No linked character" : "Lookup unavailable"}`;

  return [
    "### Linked Dune account",
    `**Character:** ${escapeDiscordText(ticket.duneAccount.characterName ?? "Unknown")}`,
    `**Status:** ${escapeDiscordText(ticket.duneAccount.onlineStatus ?? "Unknown")}`,
    `**Pawn ID:** ${escapeDiscordText(ticket.duneAccount.pawnId ?? "Unavailable")}`,
    `**Controller ID:** ${escapeDiscordText(ticket.duneAccount.controllerId ?? "Unavailable")}`,
  ].join("\n");
}

function escapeDiscordText(value: string): string {
  return value.replace(/([\\*_~`>|])/g, "\\$1").replace(/@/g, "@\u200b");
}

export { buildTicketArchiveContainer, buildTicketJson, publishTicketArchive, updateTicketArchive };
