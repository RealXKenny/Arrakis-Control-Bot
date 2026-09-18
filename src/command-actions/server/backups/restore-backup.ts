import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";

const data = new SlashCommandBuilder().setName("restore-backup").setDescription(BACKUP_ACTIONS["restore-backup"].description)
  .addStringOption((option) => option.setName("backup").setDescription("Exact backup filename to restore.").setRequired(true))
  .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm that the current server data will be replaced.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.options.getBoolean("confirm", true)) { await interaction.reply({ content: "Restore cancelled because confirmation was false.", flags: MessageFlags.Ephemeral }); return; }
  await executeBackupAction(interaction, "restore-backup", { body: { backup: interaction.options.getString("backup", true).trim() } });
}
export { data, execute };


export const groupedAction = { data, execute };
