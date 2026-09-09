import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Message,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";

import type { DiscordAdapterPlayerState } from "../../infrastructure/api/DiscordAdapterClient";
import type { TicketDuneAccount, TicketDuneLookupStatus, TicketIntake, TicketRecord } from "../../infrastructure/database/TicketRepository";
import { createLogger } from "../../infrastructure/core/logger";
import { createV2Response } from "../../shared/factories/componentFactory";
import { createActorContext } from "../../shared/utils/createActorContext";
import { getConfiguredStaffRoleIds, hasStaffRole } from "../../shared/utils/staffAccess";
import { truncateDiscordText } from "../../shared/utils/discordLimits";
import { publishTicketArchive } from "./ticketArchive";

const logger = createLogger("TICKETS");
const MAX_TRANSCRIPT_MESSAGES = 10_000;
const MAX_TRANSCRIPT_BYTES = 7_000_000;

interface CreateTicketResult {
  created: boolean;
  ticket: TicketRecord;
  channel: TextChannel | null;
}

interface CloseTicketResult {
  ticket: TicketRecord;
  transcript: string;
  dmSent: boolean;
}

async function createTicket(interaction: ModalSubmitInteraction, intake: TicketIntake): Promise<CreateTicketResult> {
  const repository = interaction.client.tickets;
  const guild = interaction.guild;

  if (!repository || !guild) {
    throw new Error("Ticket storage or guild context is unavailable.");
  }

  const duneLookup = await loadDuneAccount(interaction);
  const reservation = await repository.reserve(guild.id, interaction.user.id, intake, duneLookup.status, duneLookup.account);

  if (!reservation) {
    const existing = await repository.findActiveForMember(guild.id, interaction.user.id);

    if (!existing) {
      throw new Error("An active ticket exists but could not be loaded.");
    }

    const existingChannel = existing.channelId ? await guild.channels.fetch(existing.channelId).catch(() => null) : null;

    return {
      created: false,
      ticket: existing,
      channel: existingChannel?.isTextBased() && existingChannel.type === ChannelType.GuildText ? existingChannel : null,
    };
  }

  let channel: TextChannel | null = null;

  try {
    channel = await guild.channels.create({
      name: buildTicketChannelName(reservation.id, interaction.user.username, reservation.category),
      type: ChannelType.GuildText,
      parent: interaction.client.discordTicketCategoryId,
      topic: `Ticket #${reservation.id} opened by ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: buildPermissionOverwrites(guild, interaction.user.id, interaction.client.user.id),
    });

    const ticketMessage = await channel.send({
      ...createV2Response([buildTicketCard(reservation)]),
      allowedMentions: { users: [interaction.user.id] },
    });

    const activeTicket = await repository.activate(reservation.id, channel.id, ticketMessage.id);

    return { created: true, ticket: activeTicket, channel };
  } catch (error) {
    if (channel) {
      await channel.delete("Rolling back a failed ticket creation").catch(() => undefined);
    }

    await repository.remove(reservation.id).catch(() => undefined);
    throw error;
  }
}

async function closeTicket(channel: TextChannel, member: GuildMember): Promise<CloseTicketResult | null> {
  const repository = channel.client.tickets;

  if (!repository) {
    throw new Error("Ticket storage is not configured.");
  }

  const ticket = await repository.findByChannel(channel.id);

  if (!ticket || ticket.status !== "open") {
    return null;
  }

  const memberIsStaff = hasStaffRole(member);

  if (ticket.openerId !== member.id && !memberIsStaff) {
    throw new TicketPermissionError();
  }

  if (memberIsStaff && ticket.claimedBy && ticket.claimedBy !== member.id) {
    throw new TicketClaimedByAnotherStaffError(ticket.claimedBy);
  }

  const fetched = await fetchTicketMessages(channel);
  const draftTranscript = buildTicketTranscript(ticket, member, fetched.messages, fetched.truncated);
  const closed = await repository.closeByChannel(channel.id, member.id, draftTranscript, fetched.messages.length, memberIsStaff ? member.id : null);

  if (!closed) {
    const latest = await repository.findByChannel(channel.id);
    if (memberIsStaff && latest?.status === "open" && latest.claimedBy && latest.claimedBy !== member.id) {
      throw new TicketClaimedByAnotherStaffError(latest.claimedBy);
    }
    return null;
  }

  const transcript = buildTicketTranscript(closed, member, fetched.messages, fetched.truncated);
  const finalized = await repository.updateTranscript(closed.id, transcript, fetched.messages.length);

  try {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      SendMessages: false,
      AddReactions: false,
      AttachFiles: false,
    });
  } catch (error) {
    await repository.reopen(ticket.id).catch(() => undefined);
    throw error;
  }

  const closedName = `closed-${ticket.id}-${slugify(channel.name.replace(/^ticket-\d+-/, ""))}`.slice(0, 100);
  await channel.setName(closedName, `Ticket closed by ${member.user.tag}`).catch(() => undefined);

  const archived = await publishTicketArchive(channel, finalized);
  const dmSent = await sendClosureDm(channel, archived, transcript, member);

  return { ticket: archived, transcript, dmSent };
}

async function sendClosureDm(ticketChannel: TextChannel, ticket: TicketRecord, transcript: string, closedBy: GuildMember): Promise<boolean> {
  try {
    const recipient = await ticketChannel.client.users.fetch(ticket.openerId);
    const closedAt = ticket.closedAt?.toISOString() ?? new Date().toISOString();
    const summary = new ContainerBuilder()
      .setAccentColor(0xc58b45)
      .addTextDisplayComponents((text) => text.setContent(`## Ticket #${ticket.id} has been closed`))
      .addTextDisplayComponents((text) =>
        text.setContent(
          truncateDiscordText(`Your **${escapeDiscordText(ticket.category)}** ticket in **${escapeDiscordText(ticketChannel.guild.name)}** was opened on ${ticket.createdAt.toISOString()} and closed by **${escapeDiscordText(closedBy.user.tag)}** on ${closedAt}. ${ticket.claimedBy ? `It was handled by <@${ticket.claimedBy}>. ` : ""}A complete transcript is attached for your records.`, 450),
        ),
      )
      .addTextDisplayComponents((text) =>
        text.setContent(
          truncateDiscordText([
            "### Your request",
            `**Subject:** ${escapeDiscordText(ticket.subject)}`,
            `**Description:**\n${escapeDiscordText(ticket.description)}`,
            `**Steps already tried:**\n${escapeDiscordText(ticket.stepsTried || "None provided")}`,
            `**Impact and urgency:**\n${escapeDiscordText(ticket.impact)}`,
          ].join("\n\n"), 2_200),
        ),
      )
      .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(formatDuneAccount(ticket), 450)))
      .addTextDisplayComponents((text) => text.setContent("### How did we do?\nPlease leave a quick review. Your rating and comments help the staff team improve future support."))
      .addActionRowComponents((row) => row.setComponents(new ButtonBuilder().setCustomId(`ticket-review:${ticket.id}`).setLabel("Leave a Review").setEmoji("⭐").setStyle(ButtonStyle.Primary)));

    await recipient.send({
      ...createV2Response([summary], [new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `ticket-${ticket.id}-transcript.txt` })]),
      allowedMentions: { users: [] },
    });

    return true;
  } catch (error) {
    logger.warn(`Ticket #${ticket.id} was closed, but the creator could not be sent a DM: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function fetchTicketMessages(channel: TextChannel): Promise<{ messages: Message[]; truncated: boolean }> {
  const messages: Message[] = [];
  let before: string | undefined;
  let truncated = false;

  while (messages.length < MAX_TRANSCRIPT_MESSAGES) {
    const remaining = MAX_TRANSCRIPT_MESSAGES - messages.length;
    const batch = await channel.messages.fetch({ limit: Math.min(remaining, 100), before });

    if (batch.size === 0) break;

    messages.push(...batch.values());
    before = batch.last()?.id;

    if (batch.size < 100) break;
    if (messages.length >= MAX_TRANSCRIPT_MESSAGES) truncated = true;
  }

  messages.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  return { messages, truncated };
}

function buildTicketTranscript(ticket: TicketRecord, closedBy: GuildMember, messages: Message[], messageLimitReached = false): string {
  const duneAccount = ticket.duneAccount;
  const header = [
    `ARRAKIS SUPPORT TICKET #${ticket.id}`,
    `Guild ID: ${ticket.guildId}`,
    `Channel ID: ${ticket.channelId ?? "Unavailable"}`,
    `Opened by: ${ticket.openerId}`,
    `Opened at: ${ticket.createdAt.toISOString()}`,
    `Closed by: ${closedBy.user.tag} (${closedBy.id})`,
    `Handled by: ${ticket.claimedBy ?? (hasStaffRole(closedBy) ? closedBy.id : "No staff handler claimed")}`,
    `Claimed at: ${ticket.claimedAt?.toISOString() ?? "Not claimed"}`,
    `Closed at: ${ticket.closedAt?.toISOString() ?? new Date().toISOString()}`,
    "",
    "REQUEST DETAILS",
    `Subject: ${ticket.subject}`,
    `Type: ${ticket.category}`,
    `Description: ${ticket.description}`,
    `Steps already tried: ${ticket.stepsTried || "None provided"}`,
    `Impact and urgency: ${ticket.impact}`,
    "",
    "LINKED DUNE ACCOUNT",
    `Lookup status: ${ticket.duneLookupStatus}`,
    `Character: ${duneAccount?.characterName ?? "Unavailable"}`,
    `Online status: ${duneAccount?.onlineStatus ?? "Unavailable"}`,
    `Pawn ID: ${duneAccount?.pawnId ?? "Unavailable"}`,
    `Controller ID: ${duneAccount?.controllerId ?? "Unavailable"}`,
    "",
    `CONVERSATION (${messages.length} messages${messageLimitReached ? ", limit reached" : ""})`,
    "=".repeat(72),
  ];

  const conversation = messages.map(formatTranscriptMessage);
  const fullTranscript = [...header, ...conversation, messageLimitReached ? "\n[Transcript stopped at the 10,000-message safety limit.]" : ""].join("\n");

  return truncateUtf8(fullTranscript, MAX_TRANSCRIPT_BYTES);
}

function formatTranscriptMessage(message: Message): string {
  const sections = [`\n[${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id})`];

  if (message.content) sections.push(message.content);

  for (const embed of message.embeds) {
    const embedText = [embed.title, embed.description, ...embed.fields.map((field) => `${field.name}: ${field.value}`)].filter(Boolean).join("\n");
    if (embedText) sections.push(`[Embed]\n${embedText}`);
  }

  const componentText = collectComponentText(message.components.map((component) => component.toJSON()));
  if (componentText.length > 0) sections.push(`[Panel]\n${componentText.join("\n")}`);

  for (const attachment of message.attachments.values()) {
    sections.push(`[Attachment] ${attachment.name ?? "file"}: ${attachment.url}`);
  }

  if (sections.length === 1) sections.push("[No text content]");

  return sections.join("\n");
}

function collectComponentText(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectComponentText);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const text: string[] = [];

  if (typeof record.content === "string") text.push(record.content);
  if (typeof record.label === "string") text.push(`[Control] ${record.label}`);

  for (const [key, child] of Object.entries(record)) {
    if (key !== "content" && key !== "label") text.push(...collectComponentText(child));
  }

  return text;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;

  const suffix = "\n\n[Transcript truncated at the configured size safety limit.]";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  let end = Math.min(value.length, maxBytes - suffixBytes);

  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") + suffixBytes > maxBytes) {
    end -= Math.max(1, Math.ceil(end * 0.01));
  }

  return value.slice(0, end) + suffix;
}

function buildPermissionOverwrites(guild: Guild, openerId: string, botId: string) {
  const memberPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const staffPermissions = [...memberPermissions, PermissionFlagsBits.ManageMessages];
  const staffRoleIds = getConfiguredStaffRoleIds().filter((roleId) => guild.roles.cache.has(roleId));

  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: openerId, allow: memberPermissions },
    { id: botId, allow: [...staffPermissions, PermissionFlagsBits.ManageChannels] },
    ...staffRoleIds.map((id) => ({ id, allow: staffPermissions })),
  ];
}

function buildTicketCard(ticket: TicketRecord): ContainerBuilder {
  const card = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(`## Ticket #${ticket.id}: ${escapeDiscordText(ticket.subject)}`, 250)))
    .addTextDisplayComponents((text) => text.setContent(`<@${ticket.openerId}> opened this ticket. Staff will respond here as soon as possible.`))
    .addTextDisplayComponents((text) =>
      text.setContent(
        truncateDiscordText(
        [
          `### Request details`,
          `**Type:** ${escapeDiscordText(ticket.category)}`,
          `**Description:**\n${escapeDiscordText(ticket.description)}`,
          `**Steps already tried:**\n${escapeDiscordText(ticket.stepsTried || "None provided")}`,
          `**Impact and urgency:**\n${escapeDiscordText(ticket.impact)}`,
        ].join("\n\n"), 2_400),
      ),
    )
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(formatDuneAccount(ticket), 450)))
    .addTextDisplayComponents((text) => text.setContent(ticket.claimedBy ? `### Staff assignment\nClaimed by <@${ticket.claimedBy}>${ticket.claimedAt ? ` on ${ticket.claimedAt.toISOString()}` : ""}.` : "### Staff assignment\nUnclaimed — a staff member can take ownership below."));

  return card.addActionRowComponents((row) =>
    row.setComponents(
      ticket.claimedBy
        ? new ButtonBuilder().setCustomId(`ticket-unclaim:${ticket.id}`).setLabel("Release Ticket").setStyle(ButtonStyle.Secondary)
        : new ButtonBuilder().setCustomId(`ticket-claim:${ticket.id}`).setLabel("Claim Ticket").setEmoji("✋").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ticket-close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
    ),
  );
}

async function loadDuneAccount(interaction: ModalSubmitInteraction): Promise<{ status: TicketDuneLookupStatus; account: TicketDuneAccount | null }> {
  const adapter = interaction.client.discordAdapter;

  if (!adapter) {
    return { status: "unavailable", account: null };
  }

  try {
    const player = (await adapter.getCurrentPlayer(createActorContext(interaction, "ticket-create"))) as DiscordAdapterPlayerState | null;

    if (player?.linked !== true) {
      return { status: "unlinked", account: null };
    }

    return {
      status: "linked",
      account: {
        characterName: player.characterName ?? null,
        pawnId: toNullableString(player.pawnId),
        controllerId: toNullableString(player.controllerId),
        onlineStatus: player.onlineStatus ?? (player.online === true ? "Online" : player.online === false ? "Offline" : null),
      },
    };
  } catch (error) {
    logger.warn(`Unable to enrich ticket with linked Dune account data: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "unavailable", account: null };
  }
}

function formatDuneAccount(ticket: TicketRecord): string {
  if (ticket.duneLookupStatus === "unavailable") {
    return "### Linked Dune account\nAccount lookup was unavailable when this ticket was opened.";
  }

  if (!ticket.duneAccount) {
    return "### Linked Dune account\nNo linked Dune character was found.";
  }

  return [
    "### Linked Dune account",
    `**Character:** ${escapeDiscordText(ticket.duneAccount.characterName ?? "Unknown")}`,
    `**Status:** ${escapeDiscordText(ticket.duneAccount.onlineStatus ?? "Unknown")}`,
    `**Pawn ID:** ${escapeDiscordText(ticket.duneAccount.pawnId ?? "Unavailable")}`,
    `**Controller ID:** ${escapeDiscordText(ticket.duneAccount.controllerId ?? "Unavailable")}`,
  ].join("\n");
}

function toNullableString(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function buildTicketChannelName(ticketId: number, username: string, category?: string): string {
  const categorySegment = category ? `${slugify(category)}-` : "";
  return `ticket-${ticketId}-${categorySegment}${slugify(username)}`.slice(0, 100);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "member";
}

function escapeDiscordText(value: string): string {
  return value.replace(/([\\*_~`>|])/g, "\\$1").replace(/@/g, "@\u200b");
}

class TicketPermissionError extends Error {
  constructor() {
    super("Only the ticket creator or a configured staff member can close this ticket.");
    this.name = "TicketPermissionError";
  }
}

class TicketClaimedByAnotherStaffError extends Error {
  constructor(staffId: string) {
    super(`This ticket is currently claimed by <@${staffId}>. They must release it before another staff member can close it.`);
    this.name = "TicketClaimedByAnotherStaffError";
  }
}

export { TicketClaimedByAnotherStaffError, TicketPermissionError, buildTicketCard, buildTicketChannelName, buildTicketTranscript, closeTicket, createTicket, formatDuneAccount };
