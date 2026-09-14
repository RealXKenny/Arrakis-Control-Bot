import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { UPDATE_ACTIONS, executeUpdateAction } from "../../../modules/updates/updateActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("fix-steamcmd").setDescription(UPDATE_ACTIONS["fix-steamcmd"].description);
const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executeUpdateAction(interaction, "fix-steamcmd");

class FixSteamcmdCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "fix-steamcmd", description: UPDATE_ACTIONS["fix-steamcmd"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] });
  }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}

export { FixSteamcmdCommand, data, execute };

