import { cleanupResources } from "../shared/process/cleanupResources";
import { GatewayIntentBits } from "discord.js";
import { DuneApi } from "../infrastructure/http/dune-console/DuneApi";
import { DiscordAdapterClient } from "../infrastructure/http/discord-adapter/DiscordAdapterClient";
import { ConvoyClient } from "../infrastructure/http/convoy/ConvoyClient";
import { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";
import { createLogger, createSapphireLogger } from "./logger";
import { InMemoryRateLimitStore, RateLimiter } from "../infrastructure/rate-limit/InMemoryRateLimiter";
import { TicketRepository } from "../infrastructure/database/tickets/TicketRepository";
import { ArrakisClient } from "./ArrakisClient";
import type { ChatBridgeConfig } from "../infrastructure/config/chatBridge";
import { DiscordGameChatBridge } from "../modules/chat/DiscordGameChatBridge";
import { ChatPlayerNames } from "../modules/chat/ChatPlayerNames";
import { VoiceRepository } from "../infrastructure/database/voice/VoiceRepository";
import { VoiceService } from "../modules/voice/VoiceService";
import type { VoiceSetupConfig } from "../infrastructure/config/voiceRooms";
import type { MusicConfig } from "../infrastructure/config/music";
import { MusicService } from "../modules/music/MusicService";
import { MusicRepository } from "../infrastructure/database/music/MusicRepository";
import { MusicMuteRepository } from "../infrastructure/database/music/MusicMuteRepository";
import { MusicVoiceMute } from "../modules/music/MusicVoiceMute";

export type BotClient = ArrakisClient;

interface BotConfig {
  music?: MusicConfig;
  voiceSetup?: VoiceSetupConfig;
  voicePanelPublic?: boolean;
  chatBridge?: ChatBridgeConfig;
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
  discordFaqPanelChannelId?: string | null;
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

function createBotApplication(config: BotConfig) {
  const logger = createLogger("BOT", config.logLevel);

  logger.header("ARRAKIS CONTROL", "Dune: Awakening Discord control bot");

  const client = createClient(config.logLevel);

  configureIntegrations(client, config);

  logger.info("[01 / SYSTEM] Loading commands, events and integrations.");

  logger.info(`[CONFIG] Player links: ${client.discordAdapter ? "enabled" : "off"} | Game chat: ${client.chatBridge ? "enabled" : "off"} | Voice rooms: ${client.voiceRooms ? "enabled" : "off"} | Music: ${client.music ? "enabled" : "off"}`);

  let isShuttingDown = false;

  async function start(): Promise<void> {
    logger.info("[02 / STORAGE] Preparing persistent state.");
    if (client.tickets) {
      await client.tickets.initialize();
      logger.debug("PostgreSQL ticket storage is ready.");
    }
    await client.voiceRooms?.initialize();
    await client.music?.initialize();

    logger.info(`[STORAGE] ${client.tickets ? "PostgreSQL initialized" : "Not configured"}.`);
    logger.debug(`Dune Console API key configured; ${client.duneApi.endpoints.length} endpoints catalogued.`);
    logger.info("[03 / DISCORD] Connecting to the gateway.");

    await client.login(config.discordToken);

    logger.debug("Discord login request completed.");
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
    if (client.stormAnnouncementInterval) clearInterval(client.stormAnnouncementInterval);

    const stopMusic = client.music?.stop() ?? Promise.resolve();
    await cleanupResources(
      [
        { name: "RabbitMQ chat bridge", run: () => client.chatBridge?.stop() },
        { name: "music and Discord client", run: async () => {
          try { await stopMusic; }
          finally { await client.destroy(); }
        } },
        { name: "voice rooms and PostgreSQL connection pool", run: async () => {
          try { await client.voiceRooms?.stop(); }
          finally {
            try { await stopMusic; }
            finally { await client.tickets?.close(); }
          }
        } },
      ],
      (name, error) => logger.error(`Unable to close the ${name} cleanly.`, error),
      () => logger.warn("Graceful shutdown timed out; forcing process exit."),
    );

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates],
    logger: { instance: createSapphireLogger("BOT", logLevel) },
  });
}

function configureIntegrations(client: BotClient, config: BotConfig): void {
  client.duneApi = new DuneApi(config.duneConsoleUrl, config.duneConsoleApiKey);
  if (config.chatBridge) {
    const chatNames = new ChatPlayerNames(client.duneApi);
    client.chatBridge = new DiscordGameChatBridge(
      client, config.chatBridge,
      (message) => client.logger.warn(message),
      (message) => client.logger.info(message),
      process.env.OWNER_ROLE_ID, chatNames.resolve,
    );
  }
  client.convoyApi = config.advinApiKey ? new ConvoyClient(config.advinApiUrl, config.advinApiKey) : null;
  client.discordAdapter = config.duneDiscordAdapterToken ? new DiscordAdapterClient(config.duneConsoleUrl, config.duneDiscordAdapterToken) : null;
  client.discordAdapterLinkPanelChannelId = config.duneDiscordLinkPanelChannelId ?? undefined;
  client.discordAdapterBlueprintPanelChannelId = config.duneDiscordBlueprintPanelChannelId ?? undefined;
  client.discordRolePanelChannelId = config.discordRolePanelChannelId ?? undefined;
  client.discordVerifyChannelId = config.discordVerifyChannelId ?? undefined;
  client.discordRulesChannelId = config.discordRulesChannelId ?? undefined;
  client.discordServerInfoChannelId = config.discordServerInfoChannelId ?? undefined;
  client.discordFaqPanelChannelId = config.discordFaqPanelChannelId ?? undefined;
  client.discordAnnouncementChannelId = config.discordAnnouncementChannelId ?? undefined;
  client.discordTicketPanelChannelId = config.discordTicketPanelChannelId ?? undefined;
  client.discordTicketCategoryId = config.discordTicketCategoryId ?? undefined;
  client.discordTicketTranscriptChannelId = config.discordTicketTranscriptChannelId ?? undefined;
  client.tickets = config.databaseUrl ? new TicketRepository(config.databaseUrl, config.databaseSsl) : null;
  client.voiceRooms = client.tickets ? new VoiceService(client, new VoiceRepository(client.tickets.pool), config.voicePanelPublic ?? true, config.voiceSetup) : undefined;
  if (config.music && !client.tickets) throw new Error("DATABASE_URL is required to persist music playback.");
  client.music = config.music && client.tickets ? new MusicService(client, config.music, new MusicRepository(client.tickets.pool),
    new MusicVoiceMute(client, config.music.guildId, config.music.voiceChannelId, new MusicMuteRepository(client.tickets.pool))) : undefined;
  client.versionAnnouncementIntervalMinutes = config.versionAnnouncementIntervalMinutes;
  client.interactionRateLimiter = new RateLimiter({
    durationMs: config.interactionCooldownMs,
    store: new InMemoryRateLimitStore({ maxEntries: config.rateLimitMaxEntries }),
  });
  client.auditLogger = new DiscordAuditLogger(client, config.duneDiscordAuditChannelId ?? undefined, config.duneDiscordActivityLogChannelId ?? undefined);
}

export { createBotApplication };
