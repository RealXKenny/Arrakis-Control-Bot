import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { renderMarketBrowser } from "../../../modules/market/marketBrowser";
import { createMarketSession } from "../../../modules/market/marketSessions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("market")
  .setDescription("Browse active CHOAM Exchange sell orders and lowest asking prices.")
  .addStringOption((option) => option.setName("search").setDescription("Search by item name, category, or template ID.").setMaxLength(100))
  .addStringOption((option) => option.setName("category").setDescription("Start with one exact market category.").setMaxLength(100))
  .addStringOption((option) =>
    option
      .setName("seller")
      .setDescription("Filter listings by seller type.")
      .addChoices({ name: "All sellers", value: "all" }, { name: "Players", value: "player" }, { name: "Market bot", value: "bot" }),
  )
  .addIntegerOption((option) => option.setName("page").setDescription("Market page to display.").setMinValue(1));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const session = createMarketSession({
    ownerId: interaction.user.id,
    requestedBy: interaction.user.tag,
    search: interaction.options.getString("search")?.trim() || undefined,
    category: interaction.options.getString("category")?.trim() || undefined,
    seller: interaction.options.getString("seller") ?? "all",
    page: interaction.options.getInteger("page") ?? 1,
  });

  await renderMarketBrowser(interaction, session, true);
}

class MarketCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "market", description: "Browse active CHOAM Exchange sell orders.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { MarketCommand, data, execute };

