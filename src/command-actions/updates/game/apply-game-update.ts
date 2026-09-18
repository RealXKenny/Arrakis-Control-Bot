import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder().setName("apply-game-update").setDescription(UPDATE_ACTIONS["apply-game-update"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "apply-game-update");

export { data, execute };


export const groupedAction = { data, execute };
