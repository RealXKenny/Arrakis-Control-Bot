import { container } from "@sapphire/framework";
import { MessageFlags, type Interaction } from "discord.js";
const INTERACTION_ERROR_MESSAGE = "There was an error while handling this interaction.";

async function respondWithInteractionError(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) {
    try {
      await interaction.respond([]);
    } catch (error: unknown) {
      container.logger.error("Unable to send autocomplete fallback.", error);
    }
    return;
  }

  try {
    if ("deferred" in interaction && interaction.deferred) {
      await interaction.editReply({ content: INTERACTION_ERROR_MESSAGE });
    } else if ("replied" in interaction && interaction.replied) {
      await interaction.followUp({ content: INTERACTION_ERROR_MESSAGE, flags: MessageFlags.Ephemeral });
    } else if ("reply" in interaction && typeof interaction.reply === "function") {
      await interaction.reply({ content: INTERACTION_ERROR_MESSAGE, flags: MessageFlags.Ephemeral });
    }
  } catch (error: unknown) {
    container.logger.error("Unable to send interaction error response.", error);
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const details = "details" in error ? safeJson((error as Error & { details?: unknown }).details) : null;
  const status = "status" in error && typeof (error as Error & { status?: unknown }).status === "number" ? ` HTTP ${(error as Error & { status: number }).status}` : "";
  return `${error.name}${status}: ${error.message}` + (details ? ` | details=${details}` : "");
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length <= 1_000 ? text : `${text.slice(0, 1_000)}…`;
  } catch {
    return "[unserializable]";
  }
}

function describeInteraction(interaction: Interaction): string {
  if (interaction.isChatInputCommand()) return `/${interaction.commandName}`;
  if (interaction.isAutocomplete()) return `/${interaction.commandName} autocomplete`;
  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) return interaction.customId;
  return "unknown";
}

export { INTERACTION_ERROR_MESSAGE, describeInteraction, formatError, respondWithInteractionError };
