import path from "node:path";
import { type Client, Collection } from "discord.js";
import { createLogger } from "../core/logger";
import { findJavaScriptFiles } from "./fileLoader";
import type { CommandModule } from "../core/BotApplication";

const logger = createLogger("COMMANDS");

interface CommandClient extends Client {
  commands: Collection<string, CommandModule>;
}

function loadCommands(client: CommandClient): {
  loaded: number;
  skipped: number;
} {
  const commandsPath = path.join(__dirname, "..", "..", "app", "commands");

  let loaded = 0;
  let skipped = 0;

  for (const filePath of findJavaScriptFiles(commandsPath)) {
    try {
      const command = require(filePath) as Partial<CommandModule>;

      if (!command?.data || typeof command.execute !== "function") {
        logger.warn(`Skipped invalid command module: ${filePath}`);
        skipped += 1;
        continue;
      }

      const commandName = command.data.name;

      if (!commandName || typeof commandName !== "string") {
        logger.warn(`Skipped command with invalid name: ${filePath}`);
        skipped += 1;
        continue;
      }

      if (client.commands.has(commandName)) {
        logger.warn(`Skipped duplicate command: /${commandName}.`);
        skipped += 1;
        continue;
      }

      client.commands.set(commandName, command as CommandModule);

      loaded += 1;
    } catch (error) {
      logger.error(`Failed to load command module ${filePath}:`, error);
      skipped += 1;
    }
  }

  logger.info(`Loaded ${loaded} command${loaded === 1 ? "" : "s"}${skipped ? `; skipped ${skipped}` : ""}.`);

  return { loaded, skipped };
}

function reloadCommands(client: CommandClient): {
  loaded: number;
  skipped: number;
} {
  const commandsPath = path.join(__dirname, "..", "..", "app", "commands");

  for (const filePath of findJavaScriptFiles(commandsPath)) {
    try {
      delete require.cache[require.resolve(filePath)];
    } catch (error) {
      logger.warn(`Failed to clear command cache for ${filePath}:`, error);
    }
  }

  client.commands.clear();

  return loadCommands(client);
}

export { loadCommands, reloadCommands };
