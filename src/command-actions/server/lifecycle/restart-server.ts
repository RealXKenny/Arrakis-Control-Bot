import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder()
  .setName("restart-server")
  .setDescription(SERVER_ACTIONS["restart-server"].description)
  .addBooleanOption((option) => option.setName("immediate").setDescription("Bypass the Restart Queue countdown."));

const execute = (interaction: ChatInputCommandInteraction): Promise<void> => {
  const immediate = interaction.options.getBoolean("immediate") ?? false;
  return executeServerAction(interaction, "restart-server", undefined, { restartQueue: immediate ? "immediate" : undefined });
};

export { data, execute };


export const groupedAction = { data, execute };
