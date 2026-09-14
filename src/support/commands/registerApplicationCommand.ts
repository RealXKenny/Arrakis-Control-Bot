import { RegisterBehavior, type Command } from "@sapphire/framework";

type ChatInputCommandDefinition = Parameters<Command.Registry["registerChatInputCommand"]>[0];

function registerApplicationCommand(registry: Command.Registry, command: ChatInputCommandDefinition): void {
  if ((process.env.DISCORD_SHARD_ID ?? "0") !== "0") {
    return;
  }

  registry.registerChatInputCommand(command, {
    behaviorWhenNotIdentical: RegisterBehavior.Overwrite,
  });
}

export { registerApplicationCommand };
