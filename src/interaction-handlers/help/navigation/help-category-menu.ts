import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";

import { getHelpCategory } from "../../../modules/help/helpCatalog";
import { renderHelpBrowser } from "../../../modules/help/helpBrowser";
import { getHelpSession } from "../../../modules/help/helpSessions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

const CUSTOM_ID = /^help-category:([A-Za-z0-9_-]+)$/;

async function execute(interaction: StringSelectMenuInteraction): Promise<void> {
  const match = interaction.customId.match(CUSTOM_ID);
  const session = match ? getHelpSession(match[1]) : null;
  if (!session) { await interaction.reply({ content: "This help browser has expired. Run `/help` to open a new one.", flags: MessageFlags.Ephemeral }); return; }
  if (session.ownerId !== interaction.user.id) { await interaction.reply({ content: "Only the member who opened this help browser can use its controls.", flags: MessageFlags.Ephemeral }); return; }
  const category = getHelpCategory(interaction.values[0] ?? "");
  if (!category) { await interaction.reply({ content: "That help category is unavailable.", flags: MessageFlags.Ephemeral }); return; }
  await interaction.deferUpdate();
  session.categoryId = category.id;
  session.page = 1;
  await renderHelpBrowser(interaction, session);
}

class HelpCategoryMenu extends RateLimitedInteractionHandler<StringSelectMenuInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) { super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu }); }
  public override parse(interaction: StringSelectMenuInteraction) { return CUSTOM_ID.test(interaction.customId) ? this.some() : this.none(); }
  protected override handle(interaction: StringSelectMenuInteraction): Promise<void> { return execute(interaction); }
}

export { HelpCategoryMenu, execute };
