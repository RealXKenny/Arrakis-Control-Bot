import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { HELP_CATEGORIES, getHelpCategory } from "../../../modules/help/helpCatalog";
import { renderHelpBrowser } from "../../../modules/help/helpBrowser";
import { createHelpSession } from "../../../modules/help/helpSessions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("help").setDescription("Browse the Arrakis bot command directory.")
  .addStringOption((option) => option.setName("category").setDescription("Open a specific command category.").addChoices(...HELP_CATEGORIES.map((category) => ({ name: `${category.emoji} ${category.label}`, value: category.id }))));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const requestedCategory = interaction.options.getString("category") ?? "general";
  const categoryId = getHelpCategory(requestedCategory)?.id ?? "general";
  const session = createHelpSession({ ownerId: interaction.user.id, requestedBy: interaction.user.tag, categoryId });
  await interaction.deferReply();
  await renderHelpBrowser(interaction, session);
}

class HelpCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "help", description: "Browse the Arrakis bot command directory.", preconditions: ["InteractionRateLimit"] });
  }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}

export { HelpCommand, data, execute };
