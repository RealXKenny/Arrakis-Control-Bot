import { container } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, type ChatInputCommandInteraction } from "discord.js";

import { scopedLogger } from "../../../client/logger";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";

const SERVER_ACTIONS = {
  "start-server": {
    route: "/api/server/start",
    body: {},
    present: "Starting",
    complete: "Start requested",
    failure: "The Dune server could not be started.",
    description: "Start the Dune server.",
  },
  "stop-server": {
    route: "/api/server/stop",
    body: {},
    present: "Stopping",
    complete: "Stop requested",
    failure: "The Dune server could not be stopped.",
    description: "Stop the Dune server.",
  },
  "restart-server": {
    route: "/api/server/restart",
    body: {},
    present: "Restarting",
    complete: "Restart requested",
    failure: "The Dune server could not be restarted.",
    description: "Restart all Dune server services.",
  },
  "restart-service": {
    route: "/api/server/restart-service",
    body: {},
    present: "Restarting the selected service",
    complete: "Service restart requested",
    failure: "The selected service could not be restarted.",
    description: "Restart one Dune server service.",
  },
  "fix-network": {
    route: "/api/server/network-bind/fix",
    body: {},
    present: "Repairing the server network binding",
    complete: "Network repair requested",
    failure: "The server network binding could not be repaired.",
    description: "Fix the Dune server network binding.",
  },
  "cleanup-images": {
    route: "/api/server/storage/cleanup-images",
    body: { confirmation: "CLEAN OBSOLETE DUNE IMAGES" },
    present: "Cleaning obsolete Dune images",
    complete: "Image cleanup requested",
    failure: "Obsolete Dune images could not be cleaned.",
    description: "Clean obsolete Dune Docker images.",
  },
  "cleanup-build-cache": {
    route: "/api/server/storage/cleanup-build-cache",
    body: { confirmation: "CLEAN DOCKER BUILD CACHE" },
    present: "Cleaning the Docker build cache",
    complete: "Build-cache cleanup requested",
    failure: "The Docker build cache could not be cleaned.",
    description: "Clean the Dune Docker build cache.",
  },
} as const;

type ServerActionName = keyof typeof SERVER_ACTIONS;

function getServerAction(value: string): (typeof SERVER_ACTIONS)[ServerActionName] | null {
  return value in SERVER_ACTIONS ? SERVER_ACTIONS[value as ServerActionName] : null;
}

function getResponseMessage(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  return typeof response.message === "string" ? response.message.trim() || null : null;
}

function createResultCard(title: string, message: string, success: boolean): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(success ? 0x4f8f5b : 0x8f3025)
    .addTextDisplayComponents((text) => text.setContent(`## ${title}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(message, 1_000)));
}

async function executeServerAction(interaction: ChatInputCommandInteraction, actionName: ServerActionName, body?: unknown, query?: Record<string, string | number | boolean | null | undefined>): Promise<void> {
  const action = SERVER_ACTIONS[actionName];

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const response = await container.client.duneApi.call("POST", action.route, { body: body ?? action.body, query });
    const queued = Boolean(response && typeof response === "object" && !Array.isArray(response) && (response as Record<string, unknown>).queued === true);
    const detail = getResponseMessage(response) ?? (queued ? "The restart was queued behind the active restart countdown." : `${action.present} the Dune server was accepted by the Console.`);

    await interaction.editReply({
      ...createV2Response([createResultCard(`${queued ? "⏳" : "✅"} Server ${action.complete}`, detail, true)]),
      allowedMentions: { parse: [] },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "The Console did not provide an error message.";

    scopedLogger(container.logger, "SERVER").error(`Unable to run /${actionName}.`, error);
    await interaction.editReply({
      ...createV2Response([createResultCard(`❌ ${actionName} failed`, `${action.failure}\n\n${detail}`, false)]),
      allowedMentions: { parse: [] },
    });
  }
}

export { SERVER_ACTIONS, executeServerAction, getResponseMessage, getServerAction };
export type { ServerActionName };
