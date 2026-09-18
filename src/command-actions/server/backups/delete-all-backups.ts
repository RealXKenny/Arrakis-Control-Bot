import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";

const data = new SlashCommandBuilder().setName("delete-all-backups").setDescription(BACKUP_ACTIONS["delete-all-backups"].description)
  .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm permanent deletion of every backup.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.options.getBoolean("confirm", true)) { await interaction.reply({ content: "Bulk deletion cancelled because confirmation was false.", flags: MessageFlags.Ephemeral }); return; }
  await executeBackupAction(interaction, "delete-all-backups", { body: {} });
}
export { data, execute };


export const groupedAction = { data, execute };
