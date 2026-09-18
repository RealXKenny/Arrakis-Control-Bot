import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder().setName("cleanup-build-cache").setDescription(SERVER_ACTIONS["cleanup-build-cache"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeServerAction(interaction, "cleanup-build-cache");

export { data, execute };


export const groupedAction = { data, execute };
