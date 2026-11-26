import {
  ApplicationCommandType,
  type ApplicationCommand,
  type ApplicationCommandData,
  type ApplicationCommandManager,
  type Collection,
  type PrimaryEntryPointCommandData,
  type Snowflake,
} from "discord.js";

type GlobalCommandSet = ApplicationCommandManager["set"];
type SetResult = Collection<Snowflake, ApplicationCommand>;

const guardedManagers = new WeakSet<ApplicationCommandManager>();

function isEntryPointData(command: unknown): boolean {
  return typeof command === "object" && command !== null && (command as { type?: unknown }).type === ApplicationCommandType.PrimaryEntryPoint;
}

/** Copies the fields Discord needs to keep an existing Activity entry point during a bulk overwrite. */
function entryPointData(command: ApplicationCommand): PrimaryEntryPointCommandData {
  return {
    name: command.name,
    nameLocalizations: command.nameLocalizations ?? undefined,
    description: command.description,
    descriptionLocalizations: command.descriptionLocalizations ?? undefined,
    type: ApplicationCommandType.PrimaryEntryPoint,
    ...(command.handler !== null ? { handler: command.handler } : {}),
    defaultMemberPermissions: command.defaultMemberPermissions,
    ...(command.integrationTypes ? { integrationTypes: command.integrationTypes } : {}),
    ...(command.contexts ? { contexts: command.contexts } : {}),
  };
}

/**
 * Discord rejects a global bulk overwrite (error 50240) that leaves out the app's Entry Point command,
 * which Discord creates itself once Activities are enabled. Sapphire cannot register that command type,
 * so the global `set` call carries the existing entry point forward. The entry point is left out of the
 * returned collection because no command piece owns it.
 */
function preserveEntryPointCommand(manager: ApplicationCommandManager): void {
  if (guardedManagers.has(manager)) return;
  guardedManagers.add(manager);

  const originalSet = manager.set.bind(manager) as (commands: readonly ApplicationCommandData[], guildId?: Snowflake) => Promise<SetResult>;

  const guardedSet = async (commands: readonly ApplicationCommandData[], guildId?: Snowflake): Promise<SetResult> => {
    if (guildId !== undefined || commands.some(isEntryPointData)) return originalSet(commands, guildId);

    // Dev note: The Activity's front door stays on its hinges while every other door gets repainted.
    const existing = await manager.fetch();
    const entryPoints = [...existing.values()].filter((command) => command.type === ApplicationCommandType.PrimaryEntryPoint);
    if (entryPoints.length === 0) return originalSet(commands);

    const result = await originalSet([...commands, ...entryPoints.map(entryPointData)]);
    return result.filter((command) => command.type !== ApplicationCommandType.PrimaryEntryPoint);
  };

  manager.set = guardedSet as GlobalCommandSet;
}

export { preserveEntryPointCommand };
