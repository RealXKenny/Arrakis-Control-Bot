import { ContainerBuilder, FileBuilder, MessageFlags, SeparatorSpacingSize, type Client, type Interaction, type MessageCreateOptions } from "discord.js";

import { createLogger } from "../../infrastructure/core/logger";

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
      logger.warn(`Skipped Discord log '${title}': no destination channel is configured.`);

      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isSendable()) {
        throw new Error(`Audit channel ${channelId} is not a sendable channel.`);
      }

      const card = new ContainerBuilder()
        .setAccentColor(0xc58b45)
        .addTextDisplayComponents((text) => text.setContent(`## ${title}`))
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((text) => text.setContent(lines.join("\n")));

      for (const file of files) {
        const filename = file.name ?? "attachment";

        card.addFileComponents(new FileBuilder().setURL(`attachment://${filename}`));
      }

      const message: MessageCreateOptions = {
        components: [card],
        files,
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

  try {
    const response = await fetch(attachment.url);

    if (!response.ok) {
      throw new Error(`Discord upload download returned HTTP ${response.status}.`);
    }

    return {
      attachment: Buffer.from(await response.arrayBuffer()),
      name: attachment.name,
      description: "Original uploaded blueprint",
    };
  } catch (error: unknown) {
    logger.warn("Unable to download the uploaded blueprint for the audit log.", error);

    return null;
  }
}

export { DiscordAuditLogger };

export type { AuditAttachment, AuditFile, BlueprintImportResult, LinkedPlayer, PlayerLinkResult };
