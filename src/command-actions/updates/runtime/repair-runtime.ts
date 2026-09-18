import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder().setName("repair-runtime").setDescription(UPDATE_ACTIONS["repair-runtime"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "repair-runtime");

export { data, execute };


export const groupedAction = { data, execute };
