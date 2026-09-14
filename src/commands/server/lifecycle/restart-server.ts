import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { SERVER_ACTIONS, executeServerAction } from "../../../modules/server/operations/serverActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("restart-server")
  .setDescription(SERVER_ACTIONS["restart-server"].description)
  .addBooleanOption((option) => option.setName("immediate").setDescription("Bypass the Restart Queue countdown."));

const execute = (interaction: ChatInputCommandInteraction): Promise<void> => {
  const immediate = interaction.options.getBoolean("immediate") ?? false;
  return executeServerAction(interaction, "restart-server", undefined, { restartQueue: immediate ? "immediate" : undefined });
};

class RestartServerCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "restart-server", description: SERVER_ACTIONS["restart-server"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { RestartServerCommand, data, execute };

