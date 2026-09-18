import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder().setName("start-server").setDescription(SERVER_ACTIONS["start-server"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeServerAction(interaction, "start-server");

export { data, execute };


export const groupedAction = { data, execute };
