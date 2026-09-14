import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from "discord.js";

import { executePlayerAdminAction, getPlayerAdminAction, type PlayerAdminAction, type PlayerAdminOption } from "../../modules/players/administration/playerAdminActions";
import { registerApplicationCommand } from "./registerApplicationCommand";

const PLAYER_ADMIN_COMMAND_NAMES: Record<string, string> = {
  "items.give-item": "give-item",
  "items.give-items": "give-items",
  "items.give-item-id": "give-item-id",
  "items.add-xp": "add-player-xp",
  "items.set-skill-points": "set-skill-points",
  "items.set-skill-module": "set-skill-module",
  "items.refill-water": "refill-player-water",
  "actions.kick": "kick-player",
  "actions.ban-status": "player-ban-status",
  "actions.ban": "ban-player",
  "actions.unban": "unban-player",
  "actions.repair-login-queue": "repair-login-queue",
  "actions.teleport": "teleport-player",
  "actions.spawn-vehicle": "spawn-player-vehicle",
  "reset.clean-inventory": "clean-player-inventory",
  "reset.reset-progression": "reset-player-progression",
  "progression.add-currency": "add-player-currency",
  "progression.faction-reputation": "add-faction-reputation",
  "progression.assign-faction": "assign-player-faction",
  "progression.add-intel": "add-player-intel",
  "progression.specialization-add-xp": "add-specialization-xp",
  "progression.specialization-max": "max-specialization",
  "progression.specialization-reset": "reset-specialization",
  "progression.keystones-grant-all": "grant-all-keystones",
  "progression.keystones-reset-all": "reset-all-keystones",
  "progression.unlock-recipe": "unlock-crafting-recipe",
  "progression.unlock-research": "unlock-player-research",
  "progression.journey-complete": "complete-journey-node",
  "progression.journey-reset": "reset-journey-node",
  "progression.tutorial-complete": "complete-tutorial",
  "progression.tutorial-reset": "reset-tutorial",
  "equipment.repair-gear": "repair-player-gear",
  "equipment.repair-vehicle-decay": "repair-vehicle-decay",
  "equipment.refuel-vehicle": "refuel-player-vehicle",
  "equipment.augment-item": "augment-player-item",
  "inventory.delete-item": "delete-inventory-item",
  "inventory.modify-item": "modify-inventory-item",
  "bulk.kick-all-online": "kick-all-online",
};

function addOption(command: SlashCommandSubcommandBuilder, option: PlayerAdminOption): SlashCommandSubcommandBuilder {
  const configure = <T extends { setName(value: string): T; setDescription(value: string): T; setRequired(value: boolean): T; setMinValue?(value: number): T; setMaxValue?(value: number): T }>(builder: T): T => {
    builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
    if (option.minimum !== undefined) builder.setMinValue?.(option.minimum);
    if (option.maximum !== undefined) builder.setMaxValue?.(option.maximum);
    return builder;
  };

  if (option.kind === "integer") return command.addIntegerOption(configure);
  if (option.kind === "number") return command.addNumberOption(configure);
  if (option.kind === "boolean") return command.addBooleanOption(configure);
  return command.addStringOption(configure);
}

function getPlayerAdminCommandName(action: PlayerAdminAction): string {
  const name = PLAYER_ADMIN_COMMAND_NAMES[`${action.group}.${action.name}`];
  if (!name) throw new Error(`Missing standalone command name for ${action.group}.${action.name}.`);
  return name;
}

function buildPlayerAdminCommandData(action: PlayerAdminAction): SlashCommandBuilder {
  const data = new SlashCommandBuilder().setName(getPlayerAdminCommandName(action)).setDescription(action.description);
  const optionBuilder = data as unknown as SlashCommandSubcommandBuilder;
  if (action.playerScoped !== false) data.addStringOption((option) => option.setName("player-id").setDescription("Numeric Dune player ID.").setRequired(true));
  if (action.confirm) data.addBooleanOption((option) => option.setName("confirm").setDescription("Explicitly confirm this disruptive action.").setRequired(true));
  for (const option of action.options) addOption(optionBuilder, option);
  return data;
}

function createPlayerAdminCommand(group: string, actionName: string) {
  const resolvedAction = getPlayerAdminAction(group, actionName);
  if (!resolvedAction) throw new Error(`Unknown player administration action: ${group}.${actionName}`);
  const action: PlayerAdminAction = resolvedAction;
  const name = getPlayerAdminCommandName(action);
  const data = buildPlayerAdminCommandData(action);
  const execute = (interaction: ChatInputCommandInteraction): Promise<void> => executePlayerAdminAction(interaction, action);

  class PlayerAdminStandaloneCommand extends Command {
    public constructor(context: Command.LoaderContext, options: Command.Options) {
      super(context, { ...options, name, description: action.description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] });
    }
    public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
    public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
  }

  return { CommandClass: PlayerAdminStandaloneCommand, data, execute };
}

export { PLAYER_ADMIN_COMMAND_NAMES, buildPlayerAdminCommandData, createPlayerAdminCommand, getPlayerAdminCommandName };
