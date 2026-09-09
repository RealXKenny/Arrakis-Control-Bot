import { ContainerBuilder, FileBuilder, MessageFlags, SeparatorSpacingSize, type Client, type Interaction, type MessageCreateOptions } from "discord.js";

import { createLogger } from "../../infrastructure/core/logger";
import { DISCORD_LIMITS, sanitizeAttachmentName, truncateDiscordText } from "../../shared/utils/discordLimits";

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
    return this.sendTo(this.activityChannelId, "Discord interaction", [
      `**Type:** ${type}`,
      `**User:** ${interaction.user?.tag ?? "Unknown"} (${interaction.user?.id ?? "Unknown"})`,
      `**Guild:** ${interaction.guild?.name ?? "Direct message"}`,
      `**Channel:** ${interaction.channelId ?? "Unknown"}`,
    ]);
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

export type { AuditAttachment, AuditFile, BlueprintImportResult, LinkedPlayer, PlayerLinkResult };
