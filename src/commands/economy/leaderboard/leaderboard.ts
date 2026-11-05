import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { renderSolariLeaderboard } from "../../../modules/players/leaderboard/solariLeaderboardBrowser";
import { createLeaderboardSession } from "../../../modules/players/leaderboard/solariLeaderboardSessions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the Solari leaderboard: the wealthiest Dune players on the server.")
  .addIntegerOption((option) => option.setName("page").setDescription("Leaderboard page to display.").setMinValue(1));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const session = createLeaderboardSession({
    ownerId: interaction.user.id,
    requestedBy: interaction.user.tag,
    page: interaction.options.getInteger("page") ?? 1,
  });

  await renderSolariLeaderboard(interaction, session, true);
}

class LeaderboardCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "leaderboard", description: "Show the Solari leaderboard.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { LeaderboardCommand, data, execute };
