import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder().setName("fix-steamcmd").setDescription(UPDATE_ACTIONS["fix-steamcmd"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "fix-steamcmd");

export { data, execute };


export const groupedAction = { data, execute };
