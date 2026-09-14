import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("apply-stack-update").setDescription(UPDATE_ACTIONS["apply-stack-update"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "apply-stack-update");

class ApplyStackUpdateCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "apply-stack-update", description: UPDATE_ACTIONS["apply-stack-update"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] });
  }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}

export { ApplyStackUpdateCommand, data, execute };

