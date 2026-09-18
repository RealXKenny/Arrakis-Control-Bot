import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";

const data = new SlashCommandBuilder().setName("create-backup").setDescription(BACKUP_ACTIONS["create-backup"].description);
async function execute(interaction: ChatInputCommandInteraction): Promise<void> { await executeBackupAction(interaction, "create-backup", { body: {} }); }
export { data, execute };


export const groupedAction = { data, execute };
