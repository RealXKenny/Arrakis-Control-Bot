import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";

const data = new SlashCommandBuilder()
  .setName("configure-auto-update")
  .setDescription(UPDATE_ACTIONS["configure-auto-update"].description)
  .addBooleanOption((option) => option.setName("enabled").setDescription("Enable automatic game-update checks.").setRequired(true))
  .addIntegerOption((option) => option.setName("interval-minutes").setDescription("Minutes between update checks.").setMinValue(1).setRequired(true))
  .addBooleanOption((option) => option.setName("apply-enabled").setDescription("Automatically apply available updates.").setRequired(true))
  .addBooleanOption((option) => option.setName("notify-enabled").setDescription("Enable update notifications.").setRequired(true))
  .addIntegerOption((option) => option.setName("notify-minutes").setDescription("Notification lead time in minutes.").setMinValue(0).setRequired(true))
  .addBooleanOption((option) => option.setName("wait-until-empty").setDescription("Wait for the server to become empty.").setRequired(true))
  .addIntegerOption((option) => option.setName("max-wait-minutes").setDescription("Maximum wait for an empty server.").setMinValue(0).setRequired(true))
  .addStringOption((option) => option.setName("confirmation").setDescription("Confirmation phrase required by the Console.").setMinLength(1).setMaxLength(100).setRequired(true));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const body = {
    enabled: interaction.options.getBoolean("enabled", true),
    intervalMinutes: interaction.options.getInteger("interval-minutes", true),
    applyEnabled: interaction.options.getBoolean("apply-enabled", true),
    notifyEnabled: interaction.options.getBoolean("notify-enabled", true),
    notifyMinutes: interaction.options.getInteger("notify-minutes", true),
    waitUntilEmpty: interaction.options.getBoolean("wait-until-empty", true),
    maxWaitMinutes: interaction.options.getInteger("max-wait-minutes", true),
    confirmation: interaction.options.getString("confirmation", true).trim(),
  };

  await executeUpdateAction(interaction, "configure-auto-update", body);
}

export { data, execute };


export const groupedAction = { data, execute };
