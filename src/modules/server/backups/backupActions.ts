import { container } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, type Attachment, type ChatInputCommandInteraction } from "discord.js";

import { createV2Response } from "../../../shared/discord/componentFactory";
import { DISCORD_LIMITS, truncateDiscordText } from "../../../shared/discord/discordLimits";

const BACKUP_ACTIONS = {
  "create-backup": { method: "POST", route: "/api/backups/create", description: "Create a new server backup.", complete: "Backup creation requested" },
  "restore-backup": { method: "POST", route: "/api/backups/restore", description: "Restore the server from a backup.", complete: "Backup restore requested" },
  "delete-backup": { method: "DELETE", route: "/api/backups/{backup}", description: "Delete one server backup.", complete: "Backup deleted" },
  "delete-all-backups": { method: "POST", route: "/api/backups/delete-all", description: "Delete every server backup.", complete: "All backups deleted" },
  "configure-auto-backup": { method: "POST", route: "/api/backups/auto", description: "Save automatic backup settings.", complete: "Automatic backup settings saved" },
} as const;

type BackupActionName = keyof typeof BACKUP_ACTIONS;
type BackupAttachment = Pick<Attachment, "url" | "name" | "size" | "contentType">;

function formatBackupResponse(value: unknown): string {
  if (typeof value === "string") return value.trim() || "The Console accepted the request.";
  if (!value || typeof value !== "object") return "The Console accepted the request.";
  const response = value as Record<string, unknown>;
  if (typeof response.message === "string" && response.message.trim()) return response.message.trim();
  if (typeof response.stdout === "string" && response.stdout.trim()) return `\`\`\`text\n${response.stdout.trim()}\n\`\`\``;
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function createBackupActionCard(title: string, detail: string, success: boolean): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(success ? 0x4f8f5b : 0x8f3025)
    .addTextDisplayComponents((text) => text.setContent(`## ${title}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(detail, 3_200)));
}

async function executeBackupAction(interaction: ChatInputCommandInteraction, actionName: BackupActionName, options: { body?: unknown; routeParams?: Record<string, string> } = {}): Promise<void> {
  const action = BACKUP_ACTIONS[actionName];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const response = await container.client.duneApi.call(action.method, action.route, { body: options.body, routeParams: options.routeParams });
    await interaction.editReply({ ...createV2Response([createBackupActionCard(`✅ ${action.complete}`, formatBackupResponse(response), true)]), allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    await replyBackupError(interaction, actionName, error);
  }
}

async function importExternalBackup(backup: BackupAttachment, metadata: BackupAttachment): Promise<unknown> {
  if (backup.size + metadata.size > DISCORD_LIMITS.requestBytes) throw new Error("The backup and metadata files must be 25 MB or smaller in total.");
  const [backupData, metadataData] = await Promise.all([downloadDiscordAttachment(backup), downloadDiscordAttachment(metadata)]);
  if (backupData.length + metadataData.length > DISCORD_LIMITS.requestBytes) throw new Error("The backup and metadata files must be 25 MB or smaller in total.");
  const form = new FormData();
  form.set("backup", new Blob([Uint8Array.from(backupData)], { type: backup.contentType ?? "application/octet-stream" }), backup.name);
  form.set("metadata", new Blob([Uint8Array.from(metadataData)], { type: metadata.contentType ?? "application/json" }), metadata.name);
  return container.client.duneApi.requestMultipart("POST", "/api/backups/import-external", form);
}

async function downloadDiscordAttachment(attachment: BackupAttachment): Promise<Buffer> {
  const url = new URL(attachment.url);
  if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname.toLowerCase())) throw new Error("Backup imports must use Discord-hosted attachments.");
  if (attachment.size > DISCORD_LIMITS.requestBytes) throw new Error("Each imported file must be 25 MB or smaller.");
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Unable to download ${attachment.name} from Discord (HTTP ${response.status}).`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > DISCORD_LIMITS.requestBytes) throw new Error("Each imported file must be 25 MB or smaller.");
  return readBoundedAttachment(response, DISCORD_LIMITS.requestBytes);
}

async function readBoundedAttachment(response: Response, maximumBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error("Each imported file must be 25 MB or smaller.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function replyBackupError(interaction: ChatInputCommandInteraction, actionName: string, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : "The Console did not provide an error message.";
  container.logger.error(`Unable to run /${actionName}.`, error);
  await interaction.editReply({ ...createV2Response([createBackupActionCard(`❌ ${actionName} failed`, detail, false)]), allowedMentions: { parse: [] } });
}

export { BACKUP_ACTIONS, executeBackupAction, formatBackupResponse, importExternalBackup, replyBackupError };
export type { BackupActionName };
