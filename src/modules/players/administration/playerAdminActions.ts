import { container } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, type ChatInputCommandInteraction } from "discord.js";

import type { HttpMethod } from "../../../infrastructure/http/dune-console/DuneConsoleClient";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";

type OptionKind = "string" | "integer" | "number" | "boolean" | "json-array" | "json-object";

interface PlayerAdminOption {
  name: string;
  bodyKey?: string;
  description: string;
  kind: OptionKind;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  routeKey?: string;
}

interface PlayerAdminAction {
  group: "items" | "actions" | "reset" | "progression" | "equipment" | "inventory" | "bulk";
  name: string;
  description: string;
  method: HttpMethod;
  route: string;
  options: PlayerAdminOption[];
  fixedBody?: Record<string, unknown>;
  confirm?: boolean;
  playerScoped?: boolean;
}

const commonItemOptions: PlayerAdminOption[] = [
  { name: "quantity", description: "Quantity to grant.", kind: "integer", required: true, minimum: 1 },
  { name: "durability", description: "Optional durability override.", kind: "number", minimum: 0 },
  { name: "quality", description: "Optional quality override.", kind: "integer", minimum: 0 },
  { name: "grade", description: "Optional item grade.", kind: "integer", minimum: 0 },
  { name: "augments-json", bodyKey: "augments", description: "Optional JSON array of augments.", kind: "json-array" },
  { name: "augment-quality", bodyKey: "augmentQuality", description: "Optional augment quality.", kind: "integer", minimum: 0 },
];

const confirmation = (): PlayerAdminOption => ({ name: "confirmation", description: "Confirmation phrase required by the Console.", kind: "string", required: true });
const trackType = (): PlayerAdminOption => ({ name: "track-type", bodyKey: "trackType", description: "Specialization track type.", kind: "string", required: true });

const PLAYER_ADMIN_ACTIONS: readonly PlayerAdminAction[] = [
  { group: "items", name: "give-item", description: "Give an item by name.", method: "POST", route: "/api/players/{playerId}/give-item", options: [{ name: "item-name", bodyKey: "itemName", description: "Exact item name.", kind: "string", required: true }, ...commonItemOptions] },
  { group: "items", name: "give-items", description: "Give multiple items from JSON.", method: "POST", route: "/api/players/{playerId}/give-items", options: [{ name: "items-json", bodyKey: "items", description: "JSON array of item grant objects.", kind: "json-array", required: true }, { name: "history-scope", bodyKey: "historyScope", description: "Optional history scope.", kind: "string" }, { name: "history-friendly", bodyKey: "historyFriendly", description: "Use friendly history descriptions.", kind: "boolean" }] },
  { group: "items", name: "give-item-id", description: "Give an item by template ID.", method: "POST", route: "/api/players/{playerId}/give-item-id", options: [{ name: "item-id", bodyKey: "itemId", description: "Item template ID.", kind: "string", required: true }, ...commonItemOptions] },
  { group: "items", name: "add-xp", description: "Add character XP.", method: "POST", route: "/api/players/{playerId}/add-xp", options: [{ name: "amount", description: "XP amount to add.", kind: "number", required: true }] },
  { group: "items", name: "set-skill-points", description: "Set available skill points.", method: "POST", route: "/api/players/{playerId}/set-skill-points", options: [{ name: "points", description: "New skill-point total.", kind: "integer", required: true, minimum: 0 }] },
  { group: "items", name: "set-skill-module", description: "Set a skill module level.", method: "POST", route: "/api/players/{playerId}/set-skill-module", options: [{ name: "module", description: "Skill module identifier.", kind: "string", required: true }, { name: "level", description: "Module level.", kind: "integer", required: true, minimum: 0 }] },
  { group: "items", name: "refill-water", description: "Refill player hydration.", method: "POST", route: "/api/players/{playerId}/refill-water", options: [{ name: "amount", description: "Optional hydration amount.", kind: "number", minimum: 0 }] },

  { group: "actions", name: "kick", description: "Kick a player from the game server.", method: "POST", route: "/api/players/{playerId}/kick", options: [], confirm: true },
  { group: "actions", name: "ban-status", description: "Show persistent account-ban status.", method: "GET", route: "/api/players/{playerId}/ban", options: [] },
  { group: "actions", name: "ban", description: "Persistently ban a player account.", method: "POST", route: "/api/players/{playerId}/ban", options: [{ name: "reason", description: "Optional ban reason.", kind: "string" }], fixedBody: { confirmation: "BAN PLAYER" }, confirm: true },
  { group: "actions", name: "unban", description: "Remove a persistent account ban.", method: "DELETE", route: "/api/players/{playerId}/ban", options: [], confirm: true },
  { group: "actions", name: "repair-login-queue", description: "Repair a player's login queue state.", method: "POST", route: "/api/players/{playerId}/repair-login-queue", options: [], fixedBody: { confirmation: "REPAIR LOGIN QUEUE" } },
  { group: "actions", name: "teleport", description: "Teleport a player to coordinates.", method: "POST", route: "/api/players/{playerId}/teleport", options: [{ name: "x", description: "X coordinate.", kind: "number", required: true }, { name: "y", description: "Y coordinate.", kind: "number", required: true }, { name: "z", description: "Z coordinate.", kind: "number", required: true }, { name: "yaw", description: "Facing yaw.", kind: "number", required: true }, { name: "online", description: "Require the player to be online.", kind: "boolean" }, { name: "partition-id", bodyKey: "partitionId", description: "Optional partition ID.", kind: "string" }] },
  { group: "actions", name: "spawn-vehicle", description: "Spawn a vehicle near a player.", method: "POST", route: "/api/players/{playerId}/spawn-vehicle", options: [{ name: "vehicle-id", bodyKey: "vehicleId", description: "Vehicle identifier.", kind: "string", required: true }, { name: "template", description: "Vehicle template.", kind: "string", required: true }, { name: "offset", description: "Spawn offset.", kind: "number", required: true }] },

  { group: "reset", name: "clean-inventory", description: "Remove invalid inventory items.", method: "POST", route: "/api/players/{playerId}/clean-inventory", options: [], fixedBody: { confirmation: "CLEAN INVENTORY" }, confirm: true },
  { group: "reset", name: "reset-progression", description: "Reset a player's character level.", method: "POST", route: "/api/players/{playerId}/reset-progression", options: [], fixedBody: { confirmation: "RESET PROGRESSION" }, confirm: true },

  { group: "progression", name: "add-currency", description: "Add player currency.", method: "POST", route: "/api/players/{playerId}/add-currency", options: [{ name: "currency-id", bodyKey: "currencyId", description: "Currency identifier.", kind: "string", required: true }, { name: "amount", description: "Amount to add.", kind: "number", required: true }, confirmation()] },
  { group: "progression", name: "faction-reputation", description: "Add faction reputation.", method: "POST", route: "/api/players/{playerId}/add-faction-reputation", options: [{ name: "faction-id", bodyKey: "factionId", description: "Faction identifier.", kind: "string", required: true }, { name: "amount", description: "Reputation to add.", kind: "number", required: true }, confirmation()] },
  { group: "progression", name: "assign-faction", description: "Assign Atreides, Harkonnen, or Neutral.", method: "POST", route: "/api/players/{playerId}/faction", options: [{ name: "faction-id", bodyKey: "factionId", description: "Faction: 1 Atreides, 2 Harkonnen, 3 Neutral.", kind: "integer", required: true, minimum: 1, maximum: 3 }, confirmation()] },
  { group: "progression", name: "add-intel", description: "Add player intel.", method: "POST", route: "/api/players/{playerId}/add-intel", options: [{ name: "amount", description: "Intel amount to add.", kind: "number", required: true }, confirmation()] },
  { group: "progression", name: "specialization-add-xp", description: "Add specialization XP.", method: "POST", route: "/api/players/{playerId}/specializations/add-xp", options: [trackType(), { name: "amount", description: "Specialization XP to add.", kind: "number", required: true }, confirmation()] },
  { group: "progression", name: "specialization-max", description: "Max out a specialization.", method: "POST", route: "/api/players/{playerId}/specializations/grant-max", options: [trackType(), confirmation()] },
  { group: "progression", name: "specialization-reset", description: "Reset a specialization.", method: "POST", route: "/api/players/{playerId}/specializations/reset", options: [trackType(), confirmation()], confirm: true },
  { group: "progression", name: "keystones-grant-all", description: "Grant all specialization keystones.", method: "POST", route: "/api/players/{playerId}/specializations/keystones/grant-all", options: [confirmation()] },
  { group: "progression", name: "keystones-reset-all", description: "Reset all specialization keystones.", method: "POST", route: "/api/players/{playerId}/specializations/keystones/reset-all", options: [confirmation()], confirm: true },
  { group: "progression", name: "unlock-recipe", description: "Unlock a crafting recipe.", method: "POST", route: "/api/players/{playerId}/crafting-recipes/unlock", options: [{ name: "recipe-id", bodyKey: "recipeId", description: "Recipe identifier.", kind: "string", required: true }, confirmation()] },
  { group: "progression", name: "unlock-research", description: "Unlock a research item.", method: "POST", route: "/api/players/{playerId}/research-items/unlock", options: [{ name: "item-key", bodyKey: "itemKey", description: "Research item key.", kind: "string", required: true }, confirmation()] },
  { group: "progression", name: "journey-complete", description: "Complete a journey node.", method: "POST", route: "/api/players/{playerId}/journey/complete", options: [{ name: "node-id", bodyKey: "nodeId", description: "Journey node identifier.", kind: "string", required: true }, confirmation()] },
  { group: "progression", name: "journey-reset", description: "Reset a journey node.", method: "POST", route: "/api/players/{playerId}/journey/reset", options: [{ name: "node-id", bodyKey: "nodeId", description: "Journey node identifier.", kind: "string", required: true }, confirmation()], confirm: true },
  { group: "progression", name: "tutorial-complete", description: "Complete a tutorial.", method: "POST", route: "/api/players/{playerId}/tutorials/complete", options: [{ name: "tutorial-id", bodyKey: "tutorialId", description: "Tutorial identifier.", kind: "string", required: true }, confirmation()] },
  { group: "progression", name: "tutorial-reset", description: "Reset a tutorial.", method: "POST", route: "/api/players/{playerId}/tutorials/reset", options: [{ name: "tutorial-id", bodyKey: "tutorialId", description: "Tutorial identifier.", kind: "string", required: true }, confirmation()], confirm: true },

  { group: "equipment", name: "repair-gear", description: "Repair all player equipment.", method: "POST", route: "/api/players/{playerId}/repair-gear", options: [confirmation()] },
  { group: "equipment", name: "repair-vehicle-decay", description: "Repair vehicle decay above a threshold.", method: "POST", route: "/api/players/{playerId}/repair-vehicle-decay", options: [{ name: "threshold-percent", bodyKey: "thresholdPercent", description: "Decay threshold percentage.", kind: "number", required: true, minimum: 0, maximum: 100 }, confirmation()] },
  { group: "equipment", name: "refuel-vehicle", description: "Refuel a player's vehicle.", method: "POST", route: "/api/players/{playerId}/refuel-vehicle", options: [{ name: "vehicle-id", bodyKey: "vehicleId", description: "Vehicle identifier.", kind: "string", required: true }, confirmation()] },
  { group: "equipment", name: "augment-item", description: "Apply augments to an inventory item.", method: "POST", route: "/api/players/{playerId}/augment-item", options: [{ name: "item-id", bodyKey: "itemId", description: "Inventory item identifier.", kind: "string", required: true }, { name: "augments-json", bodyKey: "augments", description: "JSON array of augments.", kind: "json-array", required: true }, { name: "augment-quality", bodyKey: "augmentQuality", description: "Augment quality.", kind: "integer", required: true, minimum: 0 }, confirmation()] },

  { group: "inventory", name: "delete-item", description: "Delete an inventory item.", method: "DELETE", route: "/api/players/{playerId}/inventory/{itemId}", options: [{ name: "item-id", description: "Inventory item identifier.", kind: "string", required: true, routeKey: "itemId" }], fixedBody: { confirmation: "DELETE ITEM" }, confirm: true },
  { group: "inventory", name: "modify-item", description: "Modify inventory item values.", method: "PATCH", route: "/api/players/{playerId}/inventory/{itemId}", options: [{ name: "item-id", description: "Inventory item identifier.", kind: "string", required: true, routeKey: "itemId" }, { name: "values-json", bodyKey: "values", description: "JSON object containing item changes.", kind: "json-object", required: true }], fixedBody: { confirmation: "SAVE ITEM" }, confirm: true },

  { group: "bulk", name: "kick-all-online", description: "Kick every online player.", method: "POST", route: "/api/players/kick-all-online", options: [confirmation()], confirm: true, playerScoped: false },
];

function getPlayerAdminAction(group: string, name: string): PlayerAdminAction | null {
  return PLAYER_ADMIN_ACTIONS.find((action) => action.group === group && action.name === name) ?? null;
}

function readOption(interaction: ChatInputCommandInteraction, option: PlayerAdminOption): unknown {
  const required = option.required ?? false;
  if (option.kind === "integer") return interaction.options.getInteger(option.name, required);
  if (option.kind === "number") return interaction.options.getNumber(option.name, required);
  if (option.kind === "boolean") return interaction.options.getBoolean(option.name, required);
  const value = interaction.options.getString(option.name, required);
  if (value === null) return null;
  if (option.kind === "json-array") return parseJson(value, "array", option.name);
  if (option.kind === "json-object") return parseJson(value, "object", option.name);
  return value.trim();
}

function parseJson(value: string, expected: "array" | "object", optionName: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`\`${optionName}\` must contain valid JSON.`); }
  const valid = expected === "array" ? Array.isArray(parsed) : Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  if (!valid) throw new Error(`\`${optionName}\` must contain a JSON ${expected}.`);
  return parsed;
}

function formatPlayerAdminResponse(value: unknown): string {
  if (typeof value === "string") return value.trim() || "The Console accepted the request.";
  if (!value || typeof value !== "object") return "The Console accepted the request.";
  const response = value as Record<string, unknown>;
  if (typeof response.message === "string" && response.message.trim()) return response.message.trim();
  if (typeof response.stdout === "string" && response.stdout.trim()) return `\`\`\`text\n${response.stdout.trim()}\n\`\`\``;
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function resultCard(title: string, detail: string, success: boolean): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(success ? 0x4f8f5b : 0x8f3025)
    .addTextDisplayComponents((text) => text.setContent(`## ${title}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(detail, 3_200)));
}

async function executePlayerAdminAction(interaction: ChatInputCommandInteraction, action: PlayerAdminAction): Promise<void> {
  if (action.confirm && !interaction.options.getBoolean("confirm", true)) {
    await interaction.reply({ content: "Action cancelled because confirmation was false.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const routeParams: Record<string, string | number | boolean> = {};
    if (action.playerScoped !== false) {
      const playerId = interaction.options.getString("player-id", true).trim();
      if (!/^\d+$/.test(playerId)) throw new Error("`player-id` must be a numeric player ID.");
      routeParams.playerId = playerId;
    }

    const body: Record<string, unknown> = { ...(action.fixedBody ?? {}) };
    for (const option of action.options) {
      const value = readOption(interaction, option);
      if (value === null || value === undefined || value === "") continue;
      if (option.routeKey) routeParams[option.routeKey] = value as string | number | boolean;
      else body[option.bodyKey ?? option.name] = value;
    }

    const response = await container.client.duneApi.call(action.method, action.route, { routeParams, body: action.method === "GET" || Object.keys(body).length === 0 ? undefined : body });
    await interaction.editReply({ ...createV2Response([resultCard(`✅ ${action.description}`, formatPlayerAdminResponse(response), true)]), allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "The Console did not provide an error message.";
    container.logger.error(`Unable to run /player-admin ${action.group} ${action.name}.`, error);
    await interaction.editReply({ ...createV2Response([resultCard(`❌ ${action.name} failed`, detail, false)]), allowedMentions: { parse: [] } });
  }
}

export { PLAYER_ADMIN_ACTIONS, executePlayerAdminAction, formatPlayerAdminResponse, getPlayerAdminAction, parseJson };
export type { PlayerAdminAction, PlayerAdminOption };

