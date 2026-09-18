import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder()
  .setName("check-game-update")
  .setDescription(UPDATE_ACTIONS["check-game-update"].description)
  .addBooleanOption((option) => option.setName("fresh").setDescription("Bypass cached update-check results."));

const execute = (interaction: ChatInputCommandInteraction): Promise<void> => {
  const fresh = interaction.options.getBoolean("fresh");
  return executeUpdateAction(interaction, "check-game-update", fresh === null ? {} : { fresh });
};

export { data, execute };


export const groupedAction = { data, execute };
