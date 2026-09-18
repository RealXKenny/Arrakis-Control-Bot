import { container } from "@sapphire/framework";
import { AttachmentBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { DISCORD_LIMITS, sanitizeAttachmentName } from "../../../shared/discord/discordLimits";
import { replyBackupError } from "../../../modules/server/backups/backupActions";

const data = new SlashCommandBuilder().setName("download-backup").setDescription("Download a server backup archive.")
  .addStringOption((option) => option.setName("backup").setDescription("Exact backup filename to download.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const backup = interaction.options.getString("backup", true).trim();
    const response = await container.client.duneApi.downloadBackup(backup, DISCORD_LIMITS.defaultAttachmentBytes);
    const filename = sanitizeAttachmentName(response.filename ?? backup, "dune-backup.archive");
    await interaction.editReply({ content: `Downloaded \`${filename}\`.`, files: [new AttachmentBuilder(response.data, { name: filename })], allowedMentions: { parse: [] } });
  } catch (error: unknown) { await replyBackupError(interaction, "download-backup", error); }
}
export { data, execute };


export const groupedAction = { data, execute };
