import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type ButtonInteraction } from "discord.js";

import { renderHelpBrowser } from "../../../modules/help/helpBrowser";
import { getHelpSession } from "../../../modules/help/helpSessions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

const CUSTOM_ID = /^help-page:([A-Za-z0-9_-]+):(previous|next)$/;

async function execute(interaction: ButtonInteraction): Promise<void> {
  const match = interaction.customId.match(CUSTOM_ID);
  const session = match ? getHelpSession(match[1]) : null;
  if (!session) { await interaction.reply({ content: "This help browser has expired. Run `/help` to open a new one.", flags: MessageFlags.Ephemeral }); return; }
  if (session.ownerId !== interaction.user.id) { await interaction.reply({ content: "Only the member who opened this help browser can use its controls.", flags: MessageFlags.Ephemeral }); return; }
  await interaction.deferUpdate();
  session.page = match?.[2] === "previous" ? Math.max(1, session.page - 1) : Math.min(session.totalPages, session.page + 1);
  await renderHelpBrowser(interaction, session);
}

class HelpPageButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) { super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button }); }
  public override parse(interaction: ButtonInteraction) { return CUSTOM_ID.test(interaction.customId) ? this.some() : this.none(); }
  protected override handle(interaction: ButtonInteraction): Promise<void> { return execute(interaction); }
}

export { HelpPageButton, execute };
