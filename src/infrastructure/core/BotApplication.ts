import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { DuneApi } from "../api/DuneApi";
import { DiscordAdapterClient } from "../api/DiscordAdapterClient";
import { ConvoyClient } from "../api/ConvoyClient";
import { DiscordAuditLogger } from "../../modules/audit/DiscordAuditLogger";
import { loadCommands } from "../loaders/commandLoader";
import { loadComponentHandlers } from "../loaders/componentLoader";
import { loadEvents } from "../loaders/eventLoader";
import { createLogger } from "./logger";
import { InMemoryRateLimitStore, RateLimiter } from "../rateLimit/rateLimiter";

export interface CommandModule {
  data: {
    name: string;
    toJSON(): unknown;
  };
  execute: (interaction: import("discord.js").ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: import("discord.js").AutocompleteInteraction) => Promise<void>;
}

export interface ComponentHandler {
  customId: string;
  execute: (interaction: import("discord.js").Interaction) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, CommandModule>;
  buttons: Collection<string, ComponentHandler>;
  selectMenus: Collection<string, ComponentHandler>;
  modals: Collection<string, ComponentHandler>;
  duneApi: DuneApi;
  convoyApi: ConvoyClient | null;
  discordAdapter: DiscordAdapterClient | null;
  discordAdapterLinkPanelChannelId?: string;
  discordAdapterBlueprintPanelChannelId?: string;
  discordRolePanelChannelId?: string;
  discordVerifyChannelId?: string;
  discordRulesChannelId?: string;
  discordServerInfoChannelId?: string;
  discordAnnouncementChannelId?: string;
  versionAnnouncementIntervalMinutes?: number;
  auditLogger: DiscordAuditLogger;
  auditLogInterval?: NodeJS.Timeout;
  versionAnnouncementInterval?: NodeJS.Timeout;
  presenceInterval?: NodeJS.Timeout;
  interactionRateLimiter: RateLimiter;
}

interface BotConfig {
  logLevel?: string;
  duneConsolePassword: string;
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

  const client = createClient();

  configureIntegrations(client, config);
  registerClientEvents(client, logger);

  const commands = loadCommands(client);
  const components = loadComponentHandlers(client);
  const events = loadEvents(client);

  logger.info(`Application initialized with ${commands.loaded} commands, ${components.loaded} component handlers, and ${events.loaded} event handlers.`);

  logger.info(client.discordAdapter ? "Discord Adapter integration enabled." : "Discord Adapter integration disabled: ADAPTER_TOKEN is not configured.");

  let isShuttingDown = false;

  async function start(): Promise<void> {
    await client.duneApi.login(config.duneConsolePassword);

    logger.info(`Logged in to the Dune Console; ${client.duneApi.endpoints.length} API endpoints are available.`);

    await deployCommands();

    await client.login(config.discordToken);

    logger.info("Discord login request completed.");
  }

  async function deployCommands(): Promise<void> {
    const shardId = process.env.DISCORD_SHARD_ID ?? "0";

    if (shardId !== "0") {
      logger.debug(`Skipping command deployment on shard ${shardId}.`);
      return;
    }

    if (!config.clientId) {
      logger.warn("Skipping command deployment because CLIENT_ID is not configured.");
      return;
    }

    const route = Routes.applicationCommands(config.clientId);

    const payload = [...client.commands.values()].map((command) => command.data.toJSON());

    const rest = new REST({
      version: "10",
    }).setToken(config.discordToken);

    logger.info(`Deploying ${payload.length} application command(s).`);

    await rest.put(route, {
      body: payload,
    });

    logger.info("Application commands deployed.");
  }

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    logger.debug(`Received ${signal}; signing out of the Dune Console.`);

    if (client.auditLogInterval) clearInterval(client.auditLogInterval);
    if (client.presenceInterval) clearInterval(client.presenceInterval);
    if (client.versionAnnouncementInterval) clearInterval(client.versionAnnouncementInterval);

    const cleanup = (async (): Promise<void> => {
      try {
        await client.duneApi.logout();
        logger.debug("Logged out of the Dune Console.");
      } catch (error) {
        logger.error("Unable to log out of the Dune Console.", error);
      } finally {
        client.destroy();
        logger.debug("Discord client closed.");
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

function createClient(): BotClient {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  }) as BotClient;

  client.commands = new Collection();
  client.buttons = new Collection();
  client.selectMenus = new Collection();
  client.modals = new Collection();

  return client;
}

function configureIntegrations(client: BotClient, config: BotConfig): void {
  client.duneApi = new DuneApi(config.duneConsoleUrl);
  client.convoyApi = config.advinApiKey ? new ConvoyClient(config.advinApiUrl, config.advinApiKey) : null;
  client.discordAdapter = config.duneDiscordAdapterToken ? new DiscordAdapterClient(config.duneConsoleUrl, config.duneDiscordAdapterToken) : null;
  client.discordAdapterLinkPanelChannelId = config.duneDiscordLinkPanelChannelId ?? undefined;
  client.discordAdapterBlueprintPanelChannelId = config.duneDiscordBlueprintPanelChannelId ?? undefined;
  client.discordRolePanelChannelId = config.discordRolePanelChannelId ?? undefined;
  client.discordVerifyChannelId = config.discordVerifyChannelId ?? undefined;
  client.discordRulesChannelId = config.discordRulesChannelId ?? undefined;
  client.discordServerInfoChannelId = config.discordServerInfoChannelId ?? undefined;
  client.discordAnnouncementChannelId = config.discordAnnouncementChannelId ?? undefined;
  client.versionAnnouncementIntervalMinutes = config.versionAnnouncementIntervalMinutes;
  client.interactionRateLimiter = new RateLimiter({
    durationMs: config.interactionCooldownMs,
    store: new InMemoryRateLimitStore({ maxEntries: config.rateLimitMaxEntries }),
  });
  client.auditLogger = new DiscordAuditLogger(client, config.duneDiscordAuditChannelId ?? undefined, config.duneDiscordActivityLogChannelId ?? undefined);
}

function registerClientEvents(client: BotClient, logger: ReturnType<typeof createLogger>): void {
  client.on(Events.Error, (error) => logger.error("Discord client error.", error));
  client.on(Events.Warn, (message) => logger.warn(`Discord client warning: ${message}`));
  client.on(Events.ShardError, (error) => logger.error("Discord gateway shard error.", error));
  client.on(Events.ShardDisconnect, (event, shardId) => logger.warn(`Discord shard ${shardId} disconnected (code ${event.code}). Discord.js will reconnect automatically.`));
  client.on(Events.ShardReconnecting, (shardId) => logger.warn(`Discord shard ${shardId ?? "unknown"} is reconnecting.`));
  client.on(Events.ShardResume, (shardId, replayedEvents) => logger.info(`Discord shard ${shardId ?? "unknown"} resumed after a connection hiccup (${replayedEvents ?? 0} events replayed).`));
  client.on(Events.Invalidated, () => logger.error("Discord invalidated the session; a restart may be required."));
}

export { createBotApplication };
