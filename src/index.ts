import path from "node:path";
import { Shard, ShardingManager } from "discord.js";

import { loadEnvironment } from "./infrastructure/config/environment.js";
import { createLogger } from "./infrastructure/core/logger.js";

const REQUIRED_ENVIRONMENT = ["TOKEN"];
const SHARD_ENTRYPOINT = path.join(__dirname, "infrastructure", "core", "shard.js");
const SHUTDOWN_TIMEOUT_MS = 1_000;

const environment = loadEnvironment(REQUIRED_ENVIRONMENT);
const logger = createLogger("SHARD MANAGER", environment.logLevel);
const manager = createShardManager(environment);

let isStopping = false;

registerShutdownHandlers();
registerShardEvents(manager);
registerProcessSafety();
startShardManager(manager);

function createShardManager(config: typeof environment): ShardingManager {
  return new ShardingManager(SHARD_ENTRYPOINT, {
    token: config.discordToken,
    totalShards: config.totalShards,
  });
}

function registerShutdownHandlers(): void {
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
    process.once(signal, () => stopAll(signal, 0));
  }
}

function registerShardEvents(shardManager: ShardingManager): void {
  shardManager.on("shardCreate", (shard: Shard) => {
    shard.on("ready", () => {
      logger.info(`Discord shard ${shard.id} is ready.`);
    });

    shard.on("death", () => {
      if (!isStopping) {
        logger.error(`Discord shard ${shard.id} process exited unexpectedly.`);
      }
    });

    shard.on("reconnecting", () => {
      logger.warn(`Discord shard ${shard.id} is reconnecting.`);
    });
  });
}

function stopAll(signal: NodeJS.Signals | "SIGBREAK", exitCode: number): void {
  if (isStopping) {
    return;
  }

  isStopping = true;
  logger.info(`Received ${signal}; stopping Discord shards.`);

  for (const shard of manager.shards.values()) {
    shard.kill();
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

function startShardManager(shardManager: ShardingManager): void {
  shardManager.spawn().catch((error: unknown) => {
    logger.error("Unable to spawn Discord shards.", error);
    process.exitCode = 1;
  });
}

function registerProcessSafety(): void {
  process.on("unhandledRejection", (error: unknown) => {
    logger.fatal("Unhandled promise rejection in shard manager; shutting down.", error);
    stopAll("SIGTERM", 1);
  });

  process.on("uncaughtException", (error: Error) => {
    logger.fatal("Uncaught exception in shard manager; shutting down.", error);
    stopAll("SIGTERM", 1);
  });
}
