import { loadEnvironment } from "../infrastructure/config/environment";
import { createBotApplication } from "./BotApplication";
import { createLogger, type Logger } from "./logger";
import { monitorParentProcess } from "../shared/utils/parentProcessMonitor";

const REQUIRED_ENVIRONMENT = ["TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY"] as const;
const config = loadEnvironment([...REQUIRED_ENVIRONMENT]);
const shardId = process.env.DISCORD_SHARD_ID ?? "0";
const logger = createLogger(`SHARD ${shardId}`, config.logLevel);
const application = createBotApplication(config);

registerProcessHandlers(application, logger);
startApplication(application, logger);

function registerProcessHandlers(app: ReturnType<typeof createBotApplication>, appLogger: Logger): void {
  let isShuttingDown = false;

  process.once("SIGINT", () => void shutdownAndExit("SIGINT"));

  process.once("SIGTERM", () => void shutdownAndExit("SIGTERM"));

  process.once("SIGBREAK", () => void shutdownAndExit("SIGBREAK"));

  process.once("disconnect", () => void shutdownAndExit("parent IPC disconnect"));

  monitorParentProcess(() => void shutdownAndExit("parent process exit"));

  process.on("unhandledRejection", (error: unknown) => {
    appLogger.fatal("Unhandled promise rejection; shutting down.", error);
    void shutdownAndExit("unhandled rejection", 1);
  });

  process.on("uncaughtException", (error: Error) => {
    appLogger.fatal("Uncaught exception; shutting down.", error);
    void shutdownAndExit("uncaught exception", 1);
  });

  async function shutdownAndExit(signal: string, exitCode = 0): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    await app.shutdown(signal, exitCode);
    process.exit(exitCode);
  }
}

function startApplication(app: ReturnType<typeof createBotApplication>, appLogger: Logger): void {
  app.start().catch((error: unknown) => {
    appLogger.error("Unable to start the shard.", error);

    void shutdownAfterFailure();

    async function shutdownAfterFailure(): Promise<void> {
      await app.shutdown("startup failure", 1);
      process.exit(1);
    }
  });
}
