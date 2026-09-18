import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder().setName("cleanup-images").setDescription(SERVER_ACTIONS["cleanup-images"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeServerAction(interaction, "cleanup-images");

export { data, execute };


export const groupedAction = { data, execute };
