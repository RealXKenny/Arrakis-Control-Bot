import { container } from "@sapphire/framework";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { scopedLogger } from "../../../client/logger";
import { createContainer, createV2Response } from "../../../shared/discord/componentFactory";
import { PANEL_COLORS } from "../../../shared/discord/panelStyle";
import { isUnknownInteractionError } from "../../../support/interactions/interactionResponses";

const UNAVAILABLE_TITLE = "## Poker is not available";
const UNAVAILABLE_BODY = [
  "Discord could not open the poker table right now.",
  "If this keeps happening, ask staff to check that Activities are enabled for Arrakis Control.",
].join("\n");

/**
 * Opens the play-money poker Discord Activity. The game itself is served by the Arrakis Control
 * dashboard; the bot only asks Discord to launch it, which acknowledges the interaction.
 */
async function launchPokerActivity(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.launchActivity();
  } catch (error: unknown) {
    // Dev note: the deck stayed shuffled, but Discord would not deal us in.
    if (isUnknownInteractionError(error)) return;
    scopedLogger(container.logger, "POKER").warn("Discord refused to launch the poker Activity.", error);
    if (interaction.replied || interaction.deferred) return;
    const panel = createV2Response([createContainer({ title: UNAVAILABLE_TITLE, body: UNAVAILABLE_BODY, color: PANEL_COLORS.warning })]);
    await interaction.reply({
      ...panel,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }
}

export { UNAVAILABLE_TITLE, launchPokerActivity };
