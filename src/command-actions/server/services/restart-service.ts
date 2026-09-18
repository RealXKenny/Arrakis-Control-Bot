import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";

const data = new SlashCommandBuilder()
  .setName("restart-service")
  .setDescription(SERVER_ACTIONS["restart-service"].description)
  .addStringOption((option) => option.setName("service").setDescription("Service name reported by /services.").setMinLength(1).setMaxLength(100).setRequired(true))
  .addBooleanOption((option) => option.setName("immediate").setDescription("Bypass the Restart Queue countdown."));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const service = interaction.options.getString("service", true).trim();
  const immediate = interaction.options.getBoolean("immediate") ?? false;

  if (!service) {
    await interaction.reply({ content: "Provide a valid service name from `/services`.", flags: MessageFlags.Ephemeral });
    return;
  }

  await executeServerAction(interaction, "restart-service", { service }, { restartQueue: immediate ? "immediate" : undefined });
}

export { data, execute };


export const groupedAction = { data, execute };
