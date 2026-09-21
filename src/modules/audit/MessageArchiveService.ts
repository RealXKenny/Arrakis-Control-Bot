import { escapeMarkdown, type Message, type PartialMessage, type Snowflake } from "discord.js";
import { MessageArchiveRepository, type ArchivedMessage, type ArchivedMessageMetadata, type MessageArchiveInput } from "../../infrastructure/database/messages/MessageArchiveRepository";
import { truncateDiscordText } from "../../shared/discord/discordLimits";
import type { DiscordAuditLogger } from "./DiscordAuditLogger";

class MessageArchiveService {
  public constructor(private readonly repository: MessageArchiveRepository, private readonly auditLogger: DiscordAuditLogger) {}

  public initialize(): Promise<void> {
    return this.repository.initialize();
  }

  public async created(message: Message): Promise<void> {
    if (!message.guildId) return;
    await this.repository.save(snapshot(message));
  }

  public async edited(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
    if (!newMessage.guildId) return;
    const complete = newMessage.partial ? await newMessage.fetch().catch(() => newMessage) : newMessage;
    const after = snapshot(complete, oldMessage);
    const before = snapshot(oldMessage, complete);
    // Dev note: The archives remember every "tiny typo" that somehow changed three paragraphs.
    const archivedBefore = await this.repository.recordEdit(before, after);
    if (!archivedBefore) return;

    await this.auditLogger.sendTo(this.auditLogger.activityChannelId, "Message edited", [
      ...messageContext(after),
      `**Before:**\n${displayContent(archivedBefore.content)}`,
      `**After:**\n${displayContent(after.content)}`,
      attachmentChange(archivedBefore, after),
      `**Jump to message:** https://discord.com/channels/${after.guildId}/${after.channelId}/${after.messageId}`,
    ]);
  }

  public async deleted(message: Message | PartialMessage): Promise<void> {
    if (!message.guildId) return;
    const archived = await this.repository.markDeleted(snapshot(message));
    await this.auditLogger.sendTo(this.auditLogger.activityChannelId, "Message deleted", [
      ...messageContext(archived),
      `**Content:**\n${displayContent(archived.content)}`,
      `**Attachments:** ${attachmentSummary(archived.metadata)}`,
      "**Deleted by:** Discord does not identify the actor in message-delete events.",
    ]);
  }

  public async bulkDeleted(messages: ReadonlyMap<Snowflake, Message | PartialMessage>): Promise<void> {
    const archived = await Promise.all([...messages.values()].filter((message) => Boolean(message.guildId)).map((message) => this.repository.markDeleted(snapshot(message))));
    if (archived.length === 0) return;
    const first = archived[0]!;
    const samples = archived.slice(0, 8).map((message) => `• ${message.messageId} · ${safe(message.authorTag)}: ${safe(truncateDiscordText(message.content || "[No text content]", 180)).replace(/\n/g, " ")}`);
    await this.auditLogger.sendTo(this.auditLogger.activityChannelId, "Messages bulk deleted", [
      `**Channel:** <#${first.channelId}> (${first.channelId})`,
      `**Messages archived:** ${archived.length}`,
      "**Deleted by:** Discord does not identify the actor in message-delete events.",
      `**Recovered messages:**\n${samples.join("\n")}${archived.length > samples.length ? `\n…and ${archived.length - samples.length} more.` : ""}`,
    ]);
  }
}

function snapshot(message: Message | PartialMessage, fallback?: Message | PartialMessage): MessageArchiveInput {
  const source = message;
  const author = source.author ?? fallback?.author;
  return {
    messageId: source.id,
    guildId: source.guildId ?? fallback?.guildId ?? "unknown",
    channelId: source.channelId,
    authorId: author?.id ?? "unknown",
    authorTag: author?.tag ?? "Unknown user",
    content: source.content ?? fallback?.content ?? "",
    metadata: metadata(source, fallback),
    messageType: source.type ?? fallback?.type ?? 0,
    flags: source.flags.bitfield.toString(),
    isBot: author?.bot ?? false,
    webhookId: source.webhookId ?? fallback?.webhookId ?? null,
    createdAt: source.createdAt,
    editedAt: source.editedAt,
  };
}

function metadata(message: Message | PartialMessage, fallback?: Message | PartialMessage): ArchivedMessageMetadata {
  const attachments = message.partial && message.attachments.size === 0 ? fallback?.attachments : message.attachments;
  const embeds = message.partial && message.embeds.length === 0 ? fallback?.embeds ?? [] : message.embeds;
  const components = message.partial && message.components.length === 0 ? fallback?.components ?? [] : message.components;
  const stickers = message.partial && message.stickers.size === 0 ? fallback?.stickers : message.stickers;
  const reference = message.reference ?? fallback?.reference;
  return {
    attachments: [...(attachments?.values() ?? [])].map((item) => ({ id: item.id, name: item.name, url: item.url, size: item.size, contentType: item.contentType })),
    embeds: embeds.map((embed) => embed.toJSON()),
    components: components.map((component) => component.toJSON()),
    stickers: [...(stickers?.values() ?? [])].map((sticker) => ({ id: sticker.id, name: sticker.name, format: sticker.format })),
    reference: reference ? { messageId: reference.messageId ?? null, channelId: reference.channelId ?? null, guildId: reference.guildId ?? null } : null,
  };
}

function messageContext(message: MessageArchiveInput): string[] {
  return [
    `**Author:** ${safe(message.authorTag)} (${message.authorId})${message.isBot ? " · Bot" : ""}`,
    `**Channel:** <#${message.channelId}> (${message.channelId})`,
    `**Message ID:** ${message.messageId}`,
    `**Created:** <t:${Math.floor(message.createdAt.getTime() / 1_000)}:F>`,
  ];
}

function displayContent(value: string): string {
  return safe(truncateDiscordText(value || "[No text content]", 1_150));
}

function attachmentSummary(metadataValue: ArchivedMessageMetadata): string {
  if (metadataValue.attachments.length === 0) return "None";
  return metadataValue.attachments.slice(0, 8).map((item) => `${safe(item.name ?? "unnamed file")} (${item.size} bytes)`).join(", ");
}

function attachmentChange(before: ArchivedMessage, after: MessageArchiveInput): string {
  const oldSummary = attachmentSummary(before.metadata);
  const newSummary = attachmentSummary(after.metadata);
  return oldSummary === newSummary ? `**Attachments:** ${newSummary}` : `**Attachments before:** ${oldSummary}\n**Attachments after:** ${newSummary}`;
}

function safe(value: string): string {
  return escapeMarkdown(value).replace(/@/g, "@\u200b");
}

export { MessageArchiveService, snapshot };
