import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder().setName("fix-network").setDescription(SERVER_ACTIONS["fix-network"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeServerAction(interaction, "fix-network");

export { data, execute };


export const groupedAction = { data, execute };
