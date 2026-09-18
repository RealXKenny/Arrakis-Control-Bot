import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { RegisterBehavior, type Command } from "@sapphire/framework";

type ChatInputCommandDefinition = Parameters<Command.Registry["registerChatInputCommand"]>[0];

function registerApplicationCommand(registry: Command.Registry, command: ChatInputCommandDefinition): void {
  if (!isPrimaryShard()) {
    return;
  }

  registry.registerChatInputCommand(command, {
    behaviorWhenNotIdentical: RegisterBehavior.Overwrite,
  });
}

export { registerApplicationCommand };
