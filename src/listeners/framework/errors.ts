import {
  Events,
  Listener,
  container,
  type AutocompleteInteractionPayload,
  type ChatInputCommandErrorPayload,
  type InteractionHandlerError as InteractionHandlerErrorPayload,
  type InteractionHandlerParseError as InteractionHandlerParseErrorPayload,
  type ListenerErrorPayload,
} from "@sapphire/framework";

import { describeInteraction, formatError, respondWithInteractionError } from "../../support/interactionResponses";

async function handleInteractionError(error: unknown, interaction: ChatInputCommandErrorPayload["interaction"] | AutocompleteInteractionPayload["interaction"] | InteractionHandlerErrorPayload["interaction"]): Promise<void> {
  container.logger.error(`Unhandled ${describeInteraction(interaction)} interaction error. ${formatError(error)}`);
  container.logger.error("Interaction handler failed with full context.", {
    interaction: describeInteraction(interaction),
    interactionId: interaction.id,
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    deferred: "deferred" in interaction ? interaction.deferred : undefined,
    replied: "replied" in interaction ? interaction.replied : undefined,
  });
  await respondWithInteractionError(interaction);
}

class ChatInputCommandError extends Listener<typeof Events.ChatInputCommandError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ChatInputCommandError, name: "ChatInputCommandError" });
  }
  public override async run(error: unknown, { interaction }: ChatInputCommandErrorPayload): Promise<void> {
    await handleInteractionError(error, interaction);
  }
}

class AutocompleteError extends Listener<typeof Events.CommandAutocompleteInteractionError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.CommandAutocompleteInteractionError, name: "AutocompleteError" });
  }
  public override async run(error: unknown, { interaction }: AutocompleteInteractionPayload): Promise<void> {
    await handleInteractionError(error, interaction);
  }
}

class InteractionHandlerError extends Listener<typeof Events.InteractionHandlerError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.InteractionHandlerError, name: "InteractionHandlerError" });
  }
  public override async run(error: unknown, { interaction }: InteractionHandlerErrorPayload): Promise<void> {
    await handleInteractionError(error, interaction);
  }
}

class InteractionHandlerParseError extends Listener<typeof Events.InteractionHandlerParseError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.InteractionHandlerParseError, name: "InteractionHandlerParseError" });
  }
  public override async run(error: unknown, { interaction }: InteractionHandlerParseErrorPayload): Promise<void> {
    await handleInteractionError(error, interaction);
  }
}

class ListenerError extends Listener<typeof Events.ListenerError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ListenerError, name: "ListenerError" });
  }
  public override run(error: unknown, { piece }: ListenerErrorPayload): void {
    this.container.logger.error(`Listener ${piece.name} failed. ${formatError(error)}`);
  }
}

export { AutocompleteError, ChatInputCommandError, InteractionHandlerError, InteractionHandlerParseError, ListenerError, handleInteractionError };
