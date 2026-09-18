import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder().setName("stop-server").setDescription(SERVER_ACTIONS["stop-server"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeServerAction(interaction, "stop-server");

export { data, execute };


export const groupedAction = { data, execute };
