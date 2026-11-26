import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { RegisterBehavior, type Command } from "@sapphire/framework";
import { ApplicationIntegrationType, InteractionContextType } from "discord.js";

type ChatInputCommandDefinition = Parameters<Command.Registry["registerChatInputCommand"]>[0];

interface ContextConfigurable {
  setContexts(...contexts: InteractionContextType[]): unknown;
  setIntegrationTypes(...types: ApplicationIntegrationType[]): unknown;
}

function isContextConfigurable(value: unknown): value is ContextConfigurable {
  return typeof value === "object" && value !== null &&
    typeof (value as Partial<ContextConfigurable>).setContexts === "function" &&
    typeof (value as Partial<ContextConfigurable>).setIntegrationTypes === "function";
}

/** Commands are guild-only: no DMs, group DMs or user installs, where guild roles cannot be checked. */
function restrictToGuilds(command: ChatInputCommandDefinition): ChatInputCommandDefinition {
  if (isContextConfigurable(command)) {
    command.setContexts(InteractionContextType.Guild);
    command.setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
    return command;
  }
  if (typeof command === "function") {
    return (builder) => {
      const built = command(builder);
      builder.setContexts(InteractionContextType.Guild).setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
      return built;
    };
  }
  return { ...command, contexts: [InteractionContextType.Guild], integration_types: [ApplicationIntegrationType.GuildInstall] };
}

function registerApplicationCommand(registry: Command.Registry, command: ChatInputCommandDefinition): void {
  // Dev note: One shard holds the registration pen; the others avoid duplicate paperwork.
  if (!isPrimaryShard()) {
    return;
  }

  registry.registerChatInputCommand(restrictToGuilds(command), {
    behaviorWhenNotIdentical: RegisterBehavior.Overwrite,
  });
}

export { registerApplicationCommand, restrictToGuilds };
