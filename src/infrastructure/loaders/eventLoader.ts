import path from "node:path";
import type { Client } from "discord.js";
import { findJavaScriptFiles } from "./fileLoader.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("EVENTS");

interface EventModule {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => unknown;
}

function loadEvents(client: Client): {
  loaded: number;
} {
  const eventsPath = path.join(__dirname, "..", "..", "app", "events");

  let loaded = 0;

  for (const filePath of findJavaScriptFiles(eventsPath)) {
    try {
      const event = require(filePath) as Partial<EventModule>;

      if (typeof event.name !== "string" || typeof event.execute !== "function") {
        logger.warn(`Skipped invalid event module: ${filePath}`);
        continue;
      }

      const execute = event.execute;

      if (event.once) {
        client.once(event.name, (...args) => {
          void Promise.resolve(execute(...args)).catch((error: unknown) => {
            logger.error(`Unhandled ${event.name} event error.`, error);
          });
        });
      } else {
        client.on(event.name, (...args) => {
          void Promise.resolve(execute(...args)).catch((error: unknown) => {
            logger.error(`Unhandled ${event.name} event error.`, error);
          });
        });
      }

      loaded += 1;
    } catch (error) {
      logger.error(`Failed to load event module ${filePath}:`, error);
    }
  }

  logger.info(`Loaded ${loaded} event handler${loaded === 1 ? "" : "s"}.`);

  return { loaded };
}

export { loadEvents };
