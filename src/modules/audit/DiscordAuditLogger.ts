import { ChannelType, ContainerBuilder, escapeMarkdown, FileBuilder, MessageFlags, SeparatorSpacingSize, type Client, type Interaction, type MessageCreateOptions } from "discord.js";
import type { MusicAuditSnapshot } from "../music/MusicService";

import { createLogger } from "../../client/logger";
import { DISCORD_LIMITS, sanitizeAttachmentName, truncateDiscordText } from "../../shared/discord/discordLimits";

const logger = createLogger("DISCORD AUDIT");

interface LinkedPlayer {
  characterName?: string | null;
}

interface PlayerLinkResult {
  characterName?: string | null;
  expiresInSeconds?: number | null;
  controllerId?: string | null;
}

interface BlueprintImportResult {
  blueprintName?: string | null;
  blueprintId?: string | null;
  pieces?: number | null;
  placeables?: number | null;
  pentashields?: number | null;
}

interface AuditAttachment {
  url?: string | null;
  name?: string | null;
  size?: number | null;
}

interface AuditFile {
  attachment: Buffer;
  name: string;
  description?: string;
}

interface MusicInteractionRecord {
  action: string;
  status: "Succeeded" | "Rejected" | "Expired";
  outcome: string;
  input?: string;
}

class DiscordAuditLogger {
  public readonly client: Client;
  public readonly channelId: string | undefined;
  public readonly activityChannelId: string | undefined;

  constructor(client: Client, channelId?: string, activityChannelId?: string) {
    this.client = client;
    this.channelId = channelId;
    this.activityChannelId = activityChannelId;
  }

  async interaction(interaction: Interaction, type: string): Promise<void | unknown> {
    return this.sendTo(this.activityChannelId, "Discord interaction", interactionContext(interaction, type));
  }

  async musicInteraction(interaction: Interaction, type: string, record: MusicInteractionRecord, snapshot?: MusicAuditSnapshot): Promise<void | unknown> {
    const lines = [
      ...interactionContext(interaction, type),
      `**Action:** ${safeAuditText(record.action, 200)}`,
      `**Status:** ${record.status}`,
    ];
    if (record.input) lines.push(`**Submitted value:** ${safeAuditText(record.input, 500)}`);
    lines.push(`**Outcome:** ${safeAuditText(record.outcome, 500)}`);
    if (snapshot) lines.push(...musicSnapshotLines(snapshot));
    return this.sendTo(this.activityChannelId, "Music interaction", lines);
  }

  async playerLinkRequested(interaction: Interaction, result: PlayerLinkResult): Promise<void | unknown> {
    return this.send("Player link requested", [
      `**Discord user:** ${interaction.user.tag} (${interaction.user.id})`,
      `**Character:** ${result.characterName ?? "Unknown"}`,
      "**Result:** Verification code sent in-game",
      `**Expires:** ${result.expiresInSeconds ?? 300} seconds`,
    ]);
  }

  async playerLinked(interaction: Interaction, result: PlayerLinkResult): Promise<void | unknown> {
    return this.send("Player linked", [`**Discord user:** ${interaction.user.tag} (${interaction.user.id})`, `**Character:** ${result.characterName ?? "Unknown"}`, `**Controller ID:** ${result.controllerId ?? "Unknown"}`]);
  }

  async playerUnlinked(interaction: Interaction): Promise<void | unknown> {
    return this.send("Player unlinked", [`**Discord user:** ${interaction.user.tag} (${interaction.user.id})`]);
  }

  async blueprintImported(interaction: Interaction, linked: LinkedPlayer, result: BlueprintImportResult, attachment?: AuditAttachment | null): Promise<void | unknown> {
    const file = await downloadBlueprintAttachment(attachment);

    const fileSize = attachment?.size ? `${(attachment.size / 1024).toFixed(1)} KB` : "Unknown";

    return this.send(
      "Blueprint imported",
      [
        "**Action:** Blueprint import completed",
        `**Discord user:** ${interaction.user.tag} (${interaction.user.id})`,
        `**Character:** ${linked.characterName ?? "Unknown"}`,
        `**File:** ${attachment?.name ?? "Unknown"} (${fileSize})`,
        `**Blueprint:** ${result.blueprintName ?? "Unknown"}`,
        `**Blueprint ID:** ${result.blueprintId ?? "Unknown"}`,
        `**Pieces:** ${result.pieces ?? 0}`,
        `**Placeables:** ${result.placeables ?? 0}`,
        `**Pentashields:** ${result.pentashields ?? 0}`,
        `**Recorded:** ${new Date().toISOString()}`,
      ],
      file ? [file] : [],
    );
  }

  async send(title: string, lines: string[], files: AuditFile[] = []): Promise<void> {
    return this.sendTo(this.channelId, title, lines, files);
  }

  async sendTo(channelId: string | undefined, title: string, lines: string[], files: AuditFile[] = []): Promise<void> {
    if (!channelId) {
      logger.debug(`Skipped Discord log '${title}': no destination channel is configured.`);

      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isSendable()) {
        throw new Error(`Audit channel ${channelId} is not a sendable channel.`);
      }

      const safeFiles = files.slice(0, 3).map((file) => ({ ...file, name: sanitizeAttachmentName(file.name) }));
      const card = new ContainerBuilder()
        .setAccentColor(0xc58b45)
        .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(`## ${title}`, 250)))
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(lines.join("\n"), 3_300)));

      for (const file of safeFiles) {
        card.addFileComponents(new FileBuilder().setURL(`attachment://${file.name}`));
      }

      const message: MessageCreateOptions = {
        components: [card],
        files: safeFiles,
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: {
          parse: [],
        },
      };

      await channel.send(message);

      logger.debug(`Sent audit entry: ${title}.`);
    } catch (error: unknown) {
      logger.error(`Unable to send audit entry: ${title}.`, error);
    }
  }
}

function interactionContext(interaction: Interaction, type: string): string[] {
  const created = Math.floor(interaction.createdTimestamp / 1_000);
  const channel = interaction.channel;
  const channelName = channel && "name" in channel && typeof channel.name === "string" ? `#${safeAuditText(channel.name, 100)}` : "Unknown";
  const channelType = channel ? ChannelType[channel.type] ?? String(channel.type) : "Unknown";
  const member = interaction.member;
  const displayName = member && "displayName" in member && typeof member.displayName === "string"
    ? member.displayName : member && "nick" in member && typeof member.nick === "string" ? member.nick : interaction.user?.globalName;
  const lines = [
    `**Type:** ${safeAuditText(type, 200)}`,
    `**Interaction ID:** ${interaction.id}`,
    `**Received:** <t:${created}:F> (<t:${created}:R>)`,
    `**User:** ${safeAuditText(interaction.user?.tag ?? "Unknown", 100)} (${interaction.user?.id ?? "Unknown"})`,
  ];
  if (displayName) lines.push(`**Display name:** ${safeAuditText(displayName, 100)}`);
  lines.push(
    `**Guild:** ${safeAuditText(interaction.guild?.name ?? "Direct message", 150)} (${interaction.guildId ?? "N/A"})`,
    `**Channel:** ${channelName} (${interaction.channelId ?? "Unknown"}) · ${channelType}`,
    `**Locale:** ${interaction.locale}${interaction.guildLocale ? ` · Server: ${interaction.guildLocale}` : ""}`,
  );

  if (interaction.isChatInputCommand()) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);
    lines.push(`**Command path:** /${interaction.commandName}${group ? ` ${group}` : ""}${subcommand ? ` ${subcommand}` : ""}`);
    if (interaction.commandName === "music") {
      const query = interaction.options.getString("query");
      const volume = interaction.options.getInteger("level");
      if (query) lines.push(`**Submitted value:** ${safeAuditText(query, 500)}`);
      if (volume !== null) lines.push(`**Submitted volume:** ${volume}%`);
    }
  } else if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    lines.push(`**Custom ID:** ${safeAuditText(interaction.customId, 200)}`);
    if ((interaction.isMessageComponent() || (interaction.isModalSubmit() && interaction.isFromMessage()))) {
      lines.push(`**Source message:** ${interaction.message.id}`);
    }
    if (interaction.isAnySelectMenu() && "values" in interaction) {
      lines.push(`**Selected values:** ${interaction.values.map((value) => safeAuditText(value, 100)).join(", ") || "None"}`);
    }
  }
  return lines;
}

function musicSnapshotLines(snapshot: MusicAuditSnapshot): string[] {
  const lines = [
    `**Playback:** ${snapshot.paused ? "Paused" : "Playing"} · Volume ${snapshot.volume}% · ${formatDuration(snapshot.position)}`,
    `**Lavalink:** ${snapshot.available ? "Available" : "Unavailable"} · Voice ${snapshot.connected ? "Connected" : "Disconnected"}`,
  ];
  if (snapshot.current) {
    const duration = snapshot.current.duration > 0 ? formatDuration(snapshot.current.duration) : "Live";
    lines.push(`**Now playing:** ${safeAuditText(snapshot.current.title, 180)} — ${safeAuditText(snapshot.current.artist, 120)}`);
    lines.push(`**Track details:** ${safeAuditText(snapshot.current.source, 60)} · ${formatDuration(snapshot.position)} / ${duration} · Requested by ${snapshot.current.requester}`);
    const trackUrl = snapshot.current.uri ? safeTrackUrl(snapshot.current.uri) : undefined;
    if (trackUrl) lines.push(`**Track URL:** ${safeAuditText(trackUrl, 300)}`);
  } else {
    lines.push("**Now playing:** Nothing");
  }
  lines.push(`**Waiting:** ${snapshot.queue.length}`);
  if (snapshot.queue.length) {
    const visible = snapshot.queue.slice(0, 8).map((track, index) => `${index + 1}. ${safeAuditText(track.title, 100)} — ${safeAuditText(track.artist, 80)} · requester ${track.requester}`);
    if (snapshot.queue.length > visible.length) visible.push(`…and ${snapshot.queue.length - visible.length} more`);
    lines.push(`**Upcoming:**\n${visible.join("\n")}`);
  }
  return lines;
}

function safeAuditText(value: string, maximum: number): string {
  return truncateDiscordText(escapeMarkdown(value.replace(/\s+/g, " ").trim()) || "Unknown", maximum);
}

function safeTrackUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    // Dev note: Keep the song link, leave mystery query tokens backstage.
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Unknown";
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function downloadBlueprintAttachment(attachment?: AuditAttachment | null): Promise<AuditFile | null> {
  if (!attachment?.url || !attachment.name) {
    return null;
  }

  if (attachment.size && attachment.size > DISCORD_LIMITS.defaultAttachmentBytes) {
    logger.warn(`Skipped blueprint audit attachment larger than ${DISCORD_LIMITS.defaultAttachmentBytes} bytes.`);
    return null;
  }

  try {
    const response = await fetch(attachment.url);

    if (!response.ok) {
      throw new Error(`Discord upload download returned HTTP ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > DISCORD_LIMITS.defaultAttachmentBytes) {
      throw new Error("Blueprint attachment exceeds the Discord audit upload limit.");
    }

    return {
      attachment: await readBoundedResponse(response, DISCORD_LIMITS.defaultAttachmentBytes),
      name: sanitizeAttachmentName(attachment.name, "blueprint.json"),
      description: "Original uploaded blueprint",
    };
  } catch (error: unknown) {
    logger.warn("Unable to download the uploaded blueprint for the audit log.", error);

    return null;
  }
}

async function readBoundedResponse(response: Response, maximumBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) throw new Error("Blueprint attachment exceeded the bounded download limit.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export { DiscordAuditLogger };

export type { AuditAttachment, AuditFile, BlueprintImportResult, LinkedPlayer, MusicInteractionRecord, PlayerLinkResult };
