import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder().setName("check-stack-update").setDescription(UPDATE_ACTIONS["check-stack-update"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "check-stack-update");

export { data, execute };


export const groupedAction = { data, execute };
