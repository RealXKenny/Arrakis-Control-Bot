import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { formatBackupResponse, importExternalBackup, replyBackupError } from "../../../modules/server/backups/backupActions";

const data = new SlashCommandBuilder().setName("import-backup").setDescription("Import an external backup and its metadata.")
  .addAttachmentOption((option) => option.setName("backup").setDescription("Backup archive file.").setRequired(true))
  .addAttachmentOption((option) => option.setName("metadata").setDescription("Backup metadata file.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const response = await importExternalBackup(interaction.options.getAttachment("backup", true), interaction.options.getAttachment("metadata", true));
    await interaction.editReply({ content: `✅ ${formatBackupResponse(response)}`, allowedMentions: { parse: [] } });
  } catch (error: unknown) { await replyBackupError(interaction, "import-backup", error); }
}
export { data, execute };


export const groupedAction = { data, execute };
