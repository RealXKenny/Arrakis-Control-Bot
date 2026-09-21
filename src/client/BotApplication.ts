import { cleanupResources } from "../shared/process/cleanupResources";
import { GatewayIntentBits, Partials } from "discord.js";
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
import { LevelRepository } from "../infrastructure/database/leveling/LevelRepository";
import { LevelingService } from "../modules/community/leveling/LevelingService";
import type { LevelRoleConfig } from "../infrastructure/config/leveling";
import type { StaffApplicationConfig } from "../infrastructure/config/staffApplications";
import { StaffApplicationRepository } from "../infrastructure/database/applications/StaffApplicationRepository";
import { StaffApplicationService } from "../modules/community/applications/StaffApplicationService";
import { MessageArchiveRepository } from "../infrastructure/database/messages/MessageArchiveRepository";
import { MessageArchiveService } from "../modules/audit/MessageArchiveService";

export type BotClient = ArrakisClient;

interface BotConfig {
  music?: MusicConfig;
  voiceSetup?: VoiceSetupConfig;
  voicePanelPublic?: boolean;
  chatBridge?: ChatBridgeConfig;
  levelingEnabled: boolean;
  levelRoles: Readonly<LevelRoleConfig>;
  staffApplications?: StaffApplicationConfig;
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
  discordBotControlChannelId?: string | null;
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
  const systemLogger = createLogger("SYSTEM", config.logLevel);
  const configLogger = createLogger("CONFIG", config.logLevel);
  const storageLogger = createLogger("STORAGE", config.logLevel);
  const discordLogger = createLogger("DISCORD", config.logLevel);

  systemLogger.header("ARRAKIS CONTROL", "Dune: Awakening Bot");

  const client = createClient(config.logLevel);

  configureIntegrations(client, config);

  systemLogger.info("[01] Loading commands, events and integrations.");

  configLogger.info(
    `Links:${client.discordAdapter ? "on" : "off"} | Chat:${client.chatBridge ? "on" : "off"} | Voice:${client.voiceRooms ? "on" : "off"} | Music:${client.music ? "on" : "off"} | Levels:${client.leveling ? "on" : "off"} | Archive:${client.messageArchive ? "on" : "off"}`,
  );

  let isShuttingDown = false;

  async function start(): Promise<void> {
    storageLogger.info("[02] Preparing persistent state.");
    if (client.tickets) {
      await client.tickets.initialize();
      storageLogger.debug("PostgreSQL ticket storage is ready.");
    }
    await client.voiceRooms?.initialize();
    await client.music?.initialize();
    await client.leveling?.initialize();
    await client.staffApplications?.initialize();
    await client.messageArchive?.initialize();

    storageLogger.info(`${client.tickets ? "PostgreSQL initialized" : "Not configured"}.`);
    configLogger.debug(`Dune Console API key configured; ${client.duneApi.endpoints.length} endpoints catalogued.`);
    discordLogger.info("[03] Connecting to the gateway.");

    await client.login(config.discordToken);

    discordLogger.debug("Discord login request completed.");
  }

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    systemLogger.debug(`Received ${signal}; starting graceful shutdown.`);

    if (client.auditLogInterval) clearInterval(client.auditLogInterval);
    if (client.presenceInterval) clearInterval(client.presenceInterval);
    if (client.versionAnnouncementInterval) clearInterval(client.versionAnnouncementInterval);
    if (client.stormAnnouncementInterval) clearInterval(client.stormAnnouncementInterval);

    // Dev note: Share one stop promise; asking the DJ twice does not make teardown a duet.
    const stopMusic = client.music?.stop() ?? Promise.resolve();
    client.leveling?.stop();
    await cleanupResources(
      [
        { name: "RabbitMQ chat bridge", run: () => client.chatBridge?.stop() },
        {
          name: "music and Discord client",
          run: async () => {
            try {
              await stopMusic;
            } finally {
              await client.destroy();
            }
          },
        },
        {
          name: "voice rooms and PostgreSQL connection pool",
          run: async () => {
            try {
              await client.voiceRooms?.stop();
            } finally {
              try {
                await stopMusic;
              } finally {
                await client.tickets?.close();
              }
            }
          },
        },
      ],
      (name, error) => systemLogger.error(`Unable to close the ${name} cleanly.`, error),
      () => systemLogger.warn("Graceful shutdown timed out; forcing process exit."),
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
    partials: [Partials.Channel, Partials.Message, Partials.User],
    logger: { instance: createSapphireLogger("SAPPHIRE", logLevel) },
  });
}

function configureIntegrations(client: BotClient, config: BotConfig): void {
  client.duneApi = new DuneApi(config.duneConsoleUrl, config.duneConsoleApiKey);
  if (config.chatBridge) {
    const chatNames = new ChatPlayerNames(client.duneApi);
    const chatLogger = createLogger("CHAT BRIDGE", config.logLevel);
    client.chatBridge = new DiscordGameChatBridge(
      client,
      config.chatBridge,
      (message) => chatLogger.warn(message),
      (message) => chatLogger.info(message),
      process.env.OWNER_ROLE_ID,
      chatNames.resolve,
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
  client.discordBotControlChannelId = config.discordBotControlChannelId ?? undefined;
  client.discordTicketCategoryId = config.discordTicketCategoryId ?? undefined;
  client.discordTicketTranscriptChannelId = config.discordTicketTranscriptChannelId ?? undefined;
  // Dev note: One PostgreSQL pool waters tickets, rooms, levels, and music—water discipline applies to sockets too.
  client.tickets = config.databaseUrl ? new TicketRepository(config.databaseUrl, config.databaseSsl) : null;
  client.voiceRooms = client.tickets ? new VoiceService(client, new VoiceRepository(client.tickets.pool), config.voicePanelPublic ?? true, config.voiceSetup) : undefined;
  const levelingLogger = createLogger("LEVELING", config.logLevel);
  client.leveling = config.levelingEnabled && client.tickets ? new LevelingService(client, new LevelRepository(client.tickets.pool), config.levelRoles, (message, error) => levelingLogger.error(message, error)) : undefined;
  client.staffApplications = config.staffApplications && client.tickets ? new StaffApplicationService(client, new StaffApplicationRepository(client.tickets.pool), config.staffApplications) : undefined;
  if (config.music && !client.tickets) throw new Error("DATABASE_URL is required to persist music playback.");
  client.music =
    config.music && client.tickets
      ? new MusicService(client, config.music, new MusicRepository(client.tickets.pool), new MusicVoiceMute(client, config.music.guildId, config.music.voiceChannelId, new MusicMuteRepository(client.tickets.pool)))
      : undefined;
  client.versionAnnouncementIntervalMinutes = config.versionAnnouncementIntervalMinutes;
  client.interactionRateLimiter = new RateLimiter({
    durationMs: config.interactionCooldownMs,
    store: new InMemoryRateLimitStore({ maxEntries: config.rateLimitMaxEntries }),
  });
  client.auditLogger = new DiscordAuditLogger(client, config.duneDiscordAuditChannelId ?? undefined, config.duneDiscordActivityLogChannelId ?? undefined);
  client.messageArchive = client.tickets ? new MessageArchiveService(new MessageArchiveRepository(client.tickets.pool), client.auditLogger) : undefined;
}

export { createBotApplication };
