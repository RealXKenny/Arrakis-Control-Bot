import { container } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, type ChatInputCommandInteraction } from "discord.js";

import { createV2Response } from "../../shared/discord/componentFactory";
import { truncateDiscordText } from "../../shared/discord/discordLimits";

const UPDATE_ACTIONS = {
  "check-game-update": { method: "POST", route: "/api/updates/check-game", body: {}, description: "Check for Dune game updates.", complete: "Game update check complete" },
  "apply-game-update": { method: "POST", route: "/api/updates/apply-game", body: {}, description: "Apply available Dune game updates.", complete: "Game update requested" },
  "fix-steamcmd": { method: "POST", route: "/api/updates/fix-steamcmd", body: {}, description: "Repair SteamCMD issues.", complete: "SteamCMD repair requested" },
  "check-stack-update": { method: "POST", route: "/api/updates/check-stack", body: {}, description: "Check for server stack updates.", complete: "Stack update check complete" },
  "apply-stack-update": { method: "POST", route: "/api/updates/apply-stack", body: {}, description: "Apply available server stack updates.", complete: "Stack update requested" },
  "auto-update-status": { method: "GET", route: "/api/updates/auto-game", body: undefined, description: "Show automatic game-update settings.", complete: "Automatic update status" },
  "configure-auto-update": { method: "POST", route: "/api/updates/auto-game", body: {}, description: "Save automatic game-update settings.", complete: "Automatic update settings saved" },
  "repair-runtime": { method: "POST", route: "/api/updates/repair-runtime", body: {}, description: "Repair the update runtime installation.", complete: "Runtime repair requested" },
} as const;

type UpdateActionName = keyof typeof UPDATE_ACTIONS;

function getUpdateAction(value: string): (typeof UPDATE_ACTIONS)[UpdateActionName] | null {
  return value in UPDATE_ACTIONS ? UPDATE_ACTIONS[value as UpdateActionName] : null;
}

function formatUpdateResponse(value: unknown): string {
  if (typeof value === "string") return value.trim() || "The Console accepted the request.";
  if (!value || typeof value !== "object") return "The Console accepted the request.";

  const response = value as Record<string, unknown>;
  if (typeof response.message === "string" && response.message.trim()) return response.message.trim();
  if (typeof response.stdout === "string" && response.stdout.trim()) return `\`\`\`text\n${response.stdout.trim()}\n\`\`\``;

  try {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  } catch {
    return "The Console accepted the request.";
  }
}

function createUpdateCard(title: string, detail: string, success: boolean): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(success ? 0x4f8f5b : 0x8f3025)
    .addTextDisplayComponents((text) => text.setContent(`## ${title}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(detail, 3_200)));
}

async function executeUpdateAction(interaction: ChatInputCommandInteraction, actionName: UpdateActionName, body?: unknown): Promise<void> {
  const action = UPDATE_ACTIONS[actionName];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const options = action.method === "POST" ? { body: body ?? action.body } : {};
    const response = await container.client.duneApi.call(action.method, action.route, options);

    await interaction.editReply({
      ...createV2Response([createUpdateCard(`✅ ${action.complete}`, formatUpdateResponse(response), true)]),
      allowedMentions: { parse: [] },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "The Console did not provide an error message.";

    container.logger.error(`Unable to run /${actionName}.`, error);
    await interaction.editReply({
      ...createV2Response([createUpdateCard(`❌ ${actionName} failed`, detail, false)]),
      allowedMentions: { parse: [] },
    });
  }
}

export { UPDATE_ACTIONS, executeUpdateAction, formatUpdateResponse, getUpdateAction };
export type { UpdateActionName };
