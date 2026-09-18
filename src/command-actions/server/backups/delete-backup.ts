import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";

const data = new SlashCommandBuilder().setName("delete-backup").setDescription(BACKUP_ACTIONS["delete-backup"].description)
  .addStringOption((option) => option.setName("backup").setDescription("Exact backup filename to delete.").setRequired(true))
  .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm permanent deletion of this backup.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.options.getBoolean("confirm", true)) { await interaction.reply({ content: "Deletion cancelled because confirmation was false.", flags: MessageFlags.Ephemeral }); return; }
  await executeBackupAction(interaction, "delete-backup", { routeParams: { backup: interaction.options.getString("backup", true).trim() } });
}
export { data, execute };


export const groupedAction = { data, execute };
