import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder().setName("auto-update-status").setDescription(UPDATE_ACTIONS["auto-update-status"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "auto-update-status");

export { data, execute };


export const groupedAction = { data, execute };
