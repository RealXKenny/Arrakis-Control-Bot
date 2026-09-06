import path from "node:path";
import { Collection, type Client } from "discord.js";
import { createLogger } from "../core/logger";
import { findJavaScriptFiles } from "./fileLoader";
import type { ComponentHandler } from "../core/BotApplication";

const logger = createLogger("COMPONENTS");

interface ComponentClient extends Client {
  buttons: Collection<string, ComponentHandler>;
  selectMenus: Collection<string, ComponentHandler>;
  modals: Collection<string, ComponentHandler>;
}

const handlerTypes = Object.freeze([
  ["buttons", "buttons"],
  ["menus", "selectMenus"],
  ["modals", "modals"],
] as const);

function loadComponentHandlers(client: ComponentClient): {
  loaded: number;
  skipped: number;
} {
  let loaded = 0;
  let skipped = 0;

  for (const [directory, collectionName] of handlerTypes) {
    const handlersPath = path.join(__dirname, "..", "..", "app", "components", directory);

    for (const filePath of findJavaScriptFiles(handlersPath)) {
      try {
        const handler = require(filePath) as Partial<ComponentHandler>;

        if (typeof handler.customId !== "string" || typeof handler.execute !== "function") {
          logger.warn(`Skipped invalid ${directory} handler: ${filePath}`);
          skipped += 1;
          continue;
        }

        if (client[collectionName].has(handler.customId)) {
          logger.warn(`Skipped duplicate ${directory} handler: ${handler.customId}.`);
          skipped += 1;
          continue;
        }

        client[collectionName].set(handler.customId, handler as ComponentHandler);

        loaded += 1;
      } catch (error) {
        logger.error(`Failed to load ${directory} handler ${filePath}:`, error);
        skipped += 1;
      }
    }
  }

  logger.info(`Loaded ${loaded} component handler${loaded === 1 ? "" : "s"}${skipped ? `; skipped ${skipped}` : ""}.`);

  return { loaded, skipped };
}

function reloadComponentHandlers(client: ComponentClient): {
  loaded: number;
  skipped: number;
} {
  for (const [directory, collectionName] of handlerTypes) {
    const handlersPath = path.join(__dirname, "..", "..", "app", "components", directory);

    for (const filePath of findJavaScriptFiles(handlersPath)) {
      try {
        delete require.cache[require.resolve(filePath)];
      } catch (error) {
        logger.warn(`Failed to clear component handler cache for ${filePath}:`, error);
      }
    }

    client[collectionName].clear();
  }

  return loadComponentHandlers(client);
}

export { loadComponentHandlers, reloadComponentHandlers };
