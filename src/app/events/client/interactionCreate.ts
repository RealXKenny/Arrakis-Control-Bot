import { Events, Interaction, MessageFlags } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";

const logger = createLogger("INTERACTIONS");

const INTERACTION_ERROR_MESSAGE = "There was an error while handling this interaction.";

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction): Promise<void> {
    try {
      const interactionType = describeInteraction(interaction);

      logger.debug("Interaction received.", {
        type: interactionType,
        interactionId: interaction.id,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      if (!interaction.isAutocomplete() && isRateLimited(interaction)) {
        await respondWithRateLimit(interaction);
        return;
      }

      await interaction.client.auditLogger?.interaction(interaction, interactionType);

      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
        return;
      }

      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
        return;
      }

      if (interaction.isButton()) {
        await handleComponent(interaction, "buttons", "button");
        return;
      }

      if (interaction.isAnySelectMenu()) {
        await handleComponent(interaction, "selectMenus", "select menu");
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleComponent(interaction, "modals", "modal form");
      }
    } catch (error: unknown) {
      logger.error(`Unhandled ${describeInteraction(interaction)} interaction error. ` + formatError(error));

      logger.error("Interaction handler failed with full context.", {
        interaction: describeInteraction(interaction),
        interactionId: interaction.id,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        deferred: "deferred" in interaction ? interaction.deferred : undefined,
        replied: "replied" in interaction ? interaction.replied : undefined,
      });

      await respondWithError(interaction);
    }
  },
};

async function handleCommand(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    throw new Error(`No command registered for /${interaction.commandName}.`);
  }

  await command.execute(interaction);
}

function isRateLimited(interaction: Interaction): boolean {
  const key = `${interaction.user.id}:${describeInteraction(interaction)}`;
  return !interaction.client.interactionRateLimiter.allow(key);
}

async function respondWithRateLimit(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) return;

  try {
    if ("deferred" in interaction && interaction.deferred) {
      await interaction.editReply({ content: "Please wait a moment before trying that again." });
    } else if ("replied" in interaction && interaction.replied) {
      await interaction.followUp({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });
    } else if ("reply" in interaction && typeof interaction.reply === "function") {
      await interaction.reply({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });
    }
  } catch (error: unknown) {
    logger.warn("Unable to send interaction rate-limit response.", error);
  }
}

async function handleAutocomplete(interaction: Interaction): Promise<void> {
  if (!interaction.isAutocomplete()) {
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command?.autocomplete) {
    await interaction.respond([]);
    return;
  }

  await command.autocomplete(interaction);
}

async function handleComponent(interaction: Interaction, collectionName: "buttons" | "selectMenus" | "modals", label: string): Promise<void> {
  if (!interaction.isButton() && !interaction.isAnySelectMenu() && !interaction.isModalSubmit()) {
    return;
  }

  const handler = interaction.client[collectionName].get(interaction.customId);

  if (!handler) {
    logger.warn(`No ${label} handler registered for ${interaction.customId}.`);
    return;
  }

  await handler.execute(interaction);
}

async function respondWithError(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) {
    try {
      await interaction.respond([]);
    } catch (error: unknown) {
      logger.error("Unable to send autocomplete fallback.", error);
    }

    return;
  }

  try {
    if ("deferred" in interaction && interaction.deferred) {
      await interaction.editReply({
        content: INTERACTION_ERROR_MESSAGE,
      });
      return;
    }

    if ("replied" in interaction && interaction.replied) {
      await interaction.followUp({
        content: INTERACTION_ERROR_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if ("reply" in interaction && typeof interaction.reply === "function") {
      await interaction.reply({
        content: INTERACTION_ERROR_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error: unknown) {
    logger.error("Unable to send interaction error response.", error);
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details =
    "details" in error
      ? safeJson(
          (
            error as Error & {
              details?: unknown;
            }
          ).details,
        )
      : null;

  const status =
    "status" in error &&
    typeof (
      error as Error & {
        status?: unknown;
      }
    ).status === "number"
      ? ` HTTP ${
          (
            error as Error & {
              status: number;
            }
          ).status
        }`
      : "";

  return `${error.name}${status}: ${error.message}` + (details ? ` | details=${details}` : "");
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);

    if (text.length <= 1_000) {
      return text;
    }

    return `${text.slice(0, 1_000)}…`;
  } catch {
    return "[unserializable]";
  }
}

function describeInteraction(interaction: Interaction): string {
  if (interaction.isChatInputCommand()) {
    return `/${interaction.commandName}`;
  }

  if (interaction.isAutocomplete()) {
    return `/${interaction.commandName} autocomplete`;
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    return interaction.customId;
  }

  return "unknown";
}
