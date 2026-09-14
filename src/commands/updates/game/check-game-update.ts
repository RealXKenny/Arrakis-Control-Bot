import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("check-game-update")
  .setDescription(UPDATE_ACTIONS["check-game-update"].description)
  .addBooleanOption((option) => option.setName("fresh").setDescription("Bypass cached update-check results."));

const execute = (interaction: ChatInputCommandInteraction): Promise<void> => {
  const fresh = interaction.options.getBoolean("fresh");
  return executeUpdateAction(interaction, "check-game-update", fresh === null ? {} : { fresh });
};

class CheckGameUpdateCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "check-game-update", description: UPDATE_ACTIONS["check-game-update"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] });
  }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}

export { CheckGameUpdateCommand, data, execute };

