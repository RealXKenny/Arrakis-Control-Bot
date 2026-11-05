import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, type ButtonInteraction } from "discord.js";

import { renderSolariLeaderboard } from "../../../modules/players/leaderboard/solariLeaderboardBrowser";
import { getLeaderboardSession } from "../../../modules/players/leaderboard/solariLeaderboardSessions";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

const CUSTOM_ID = /^leaderboard-page:([A-Za-z0-9_-]+):(first|previous|next|last)$/;

async function execute(interaction: ButtonInteraction): Promise<void> {
  const match = interaction.customId.match(CUSTOM_ID);
  const session = match ? getLeaderboardSession(match[1]) : null;

  if (!session) {
    await interaction.reply({ content: "This leaderboard has expired. Run `/leaderboard` to open a new one.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (session.ownerId !== interaction.user.id) {
    await interaction.reply({ content: "Only the member who opened this leaderboard can use its controls.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  switch (match?.[2]) {
    case "first":
      session.page = 1;
      break;
    case "previous":
      session.page = Math.max(1, session.page - 1);
      break;
    case "next":
      session.page = Math.min(session.totalPages, session.page + 1);
      break;
    case "last":
      session.page = session.totalPages;
      break;
  }

  await renderSolariLeaderboard(interaction, session);
}

class LeaderboardPageButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return CUSTOM_ID.test(interaction.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ButtonInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { LeaderboardPageButton, execute };
