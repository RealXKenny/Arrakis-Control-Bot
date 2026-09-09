import { GatewayIntentBits } from "discord.js";
import { LogLevel } from "@sapphire/framework";
import { DuneApi } from "../infrastructure/api/DuneApi";
import { DiscordAdapterClient } from "../infrastructure/api/DiscordAdapterClient";
import { ConvoyClient } from "../infrastructure/api/ConvoyClient";
import { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";
import { createLogger } from "./logger";
import { InMemoryRateLimitStore, RateLimiter } from "../infrastructure/rateLimit/rateLimiter";
import { TicketRepository } from "../infrastructure/database/TicketRepository";
import { ArrakisClient } from "./ArrakisClient";

export type BotClient = ArrakisClient;

interface BotConfig {
  logLevel?: string;
  duneConsoleApiKey: string;
  duneConsoleUrl: string;
  discordToken: string;
  clientId?: string | null;
  advinApiKey?: string | null;
  advinApiUrl: string;
  duneDiscordAdapterToken?: string | null;
  duneDiscordLinkPanelChannelId?: string | null;
  duneDiscordBlueprintPanelChannelId?: string | null;
  discordRolePanelChannelId?: string | null;
  discordVerifyChannelId?: string | null;
  discordRulesChannelId?: string | null;
  discordServerInfoChannelId?: string | null;
  discordAnnouncementChannelId?: string | null;
  discordTicketPanelChannelId?: string | null;
  discordTicketCategoryId?: string | null;
  discordTicketTranscriptChannelId?: string | null;
  databaseUrl?: string | null;
  databaseSsl: boolean;
  versionAnnouncementIntervalMinutes?: number;
  interactionCooldownMs: number;
  rateLimitMaxEntries: number;
  duneDiscordAuditChannelId?: string | null;
  duneDiscordActivityLogChannelId?: string | null;
}

function clearConsole(): void {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[0f");
  } else {
    console.clear();
  }
}

function createBotApplication(config: BotConfig) {
  clearConsole();

  const logger = createLogger("BOT", config.logLevel);

  logger.header("ARRAKIS CONTROL", "Dune: Awakening Discord control bot");

  const client = createClient(config.logLevel);

  configureIntegrations(client, config);

  logger.info("Application initialized; Sapphire stores will load application pieces during login.");

  logger.info(client.discordAdapter ? "Discord Adapter integration enabled." : "Discord Adapter integration disabled: ADAPTER_TOKEN is not configured.");

  let isShuttingDown = false;

  async function start(): Promise<void> {
    if (client.tickets) {
      await client.tickets.initialize();
      logger.info("PostgreSQL ticket storage is ready.");
    }

    logger.info(`Dune Console API key authentication enabled; ${client.duneApi.endpoints.length} API endpoints are catalogued and access is controlled by key scopes.`);

    await client.login(config.discordToken);

    logger.info("Discord login request completed.");
  }

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    logger.debug(`Received ${signal}; starting graceful shutdown.`);

    if (client.auditLogInterval) clearInterval(client.auditLogInterval);
    if (client.presenceInterval) clearInterval(client.presenceInterval);
    if (client.versionAnnouncementInterval) clearInterval(client.versionAnnouncementInterval);

    const cleanup = (async (): Promise<void> => {
      try {
        await client.destroy();
        logger.debug("Discord client closed.");
      } catch (error) {
        logger.error("Unable to close the Discord client cleanly.", error);
      }

      if (client.tickets) {
        try {
          await client.tickets.close();
          logger.debug("PostgreSQL connection pool closed.");
        } catch (error) {
          logger.error("Unable to close the PostgreSQL connection pool cleanly.", error);
        }
      }
    })();

    await Promise.race([
      cleanup,
      new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.warn("Graceful shutdown timed out; forcing process exit.");
          resolve();
        }, 10_000).unref();
      }),
    ]);

    process.exitCode = exitCode;
  }

  return {
    client,
    start,
    shutdown,
  };
}

function createClient(logLevel?: string): BotClient {
  return new ArrakisClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    logger: { level: toSapphireLogLevel(logLevel) },
  });
}

function toSapphireLogLevel(level = "INFO"): LogLevel {
  const levels: Readonly<Record<string, LogLevel>> = {
    DEBUG: LogLevel.Debug,
    INFO: LogLevel.Info,
    WARN: LogLevel.Warn,
    ERROR: LogLevel.Error,
    FATAL: LogLevel.Fatal,
  };

  return levels[level.toUpperCase()] ?? LogLevel.Info;
}

function configureIntegrations(client: BotClient, config: BotConfig): void {
  client.duneApi = new DuneApi(config.duneConsoleUrl, config.duneConsoleApiKey);
  client.convoyApi = config.advinApiKey ? new ConvoyClient(config.advinApiUrl, config.advinApiKey) : null;
  client.discordAdapter = config.duneDiscordAdapterToken ? new DiscordAdapterClient(config.duneConsoleUrl, config.duneDiscordAdapterToken) : null;
  client.discordAdapterLinkPanelChannelId = config.duneDiscordLinkPanelChannelId ?? undefined;
  client.discordAdapterBlueprintPanelChannelId = config.duneDiscordBlueprintPanelChannelId ?? undefined;
  client.discordRolePanelChannelId = config.discordRolePanelChannelId ?? undefined;
  client.discordVerifyChannelId = config.discordVerifyChannelId ?? undefined;
  client.discordRulesChannelId = config.discordRulesChannelId ?? undefined;
  client.discordServerInfoChannelId = config.discordServerInfoChannelId ?? undefined;
  client.discordAnnouncementChannelId = config.discordAnnouncementChannelId ?? undefined;
  client.discordTicketPanelChannelId = config.discordTicketPanelChannelId ?? undefined;
  client.discordTicketCategoryId = config.discordTicketCategoryId ?? undefined;
  client.discordTicketTranscriptChannelId = config.discordTicketTranscriptChannelId ?? undefined;
  client.tickets = config.databaseUrl ? new TicketRepository(config.databaseUrl, config.databaseSsl) : null;
  client.versionAnnouncementIntervalMinutes = config.versionAnnouncementIntervalMinutes;
  client.interactionRateLimiter = new RateLimiter({
    durationMs: config.interactionCooldownMs,
    store: new InMemoryRateLimitStore({ maxEntries: config.rateLimitMaxEntries }),
  });
  client.auditLogger = new DiscordAuditLogger(client, config.duneDiscordAuditChannelId ?? undefined, config.duneDiscordActivityLogChannelId ?? undefined);
}

export { createBotApplication };
