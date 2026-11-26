import { Command } from "@sapphire/framework";
import { InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { launchPokerActivity } from "../../../modules/community/poker/pokerLaunch";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Open a play-money Texas Hold'em table as a Discord Activity.")
  .setContexts(InteractionContextType.Guild);

export function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  return launchPokerActivity(interaction);
}

class PokerCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "poker", description: "Open a play-money Texas Hold'em table as a Discord Activity.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { PokerCommand };
