import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { renderSolariLeaderboard } from "../../../modules/players/leaderboard/solariLeaderboardBrowser";
import { createLeaderboardSession } from "../../../modules/players/leaderboard/solariLeaderboardSessions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Server leaderboards: the wealthiest players and the fastest dungeon runs.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("solaris")
      .setDescription("The wealthiest players: banked Solari plus coins carried.")
      .addIntegerOption((option) => option.setName("page").setDescription("Leaderboard page to display.").setMinValue(1)),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("dungeons")
      .setDescription("The fastest run for every dungeon and difficulty.")
      .addIntegerOption((option) => option.setName("page").setDescription("Leaderboard page to display.").setMinValue(1)),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const session = createLeaderboardSession({
    ownerId: interaction.user.id,
    requestedBy: interaction.user.tag,
    page: interaction.options.getInteger("page") ?? 1,
    kind: interaction.options.getSubcommand(false) === "dungeons" ? "dungeons" : "solaris",
  });

  await renderSolariLeaderboard(interaction, session, true);
}

class LeaderboardCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "leaderboard", description: "Show the Solari or dungeon leaderboard.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { LeaderboardCommand, data, execute };
