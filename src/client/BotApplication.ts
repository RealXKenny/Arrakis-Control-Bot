import { PanelRepository } from "../infrastructure/database/panels/PanelRepository";
import { ReleaseAnnouncementRepository } from "../infrastructure/database/releases/ReleaseAnnouncementRepository";
import { DashboardChangelogClient } from "../infrastructure/http/dashboard/DashboardChangelogClient";
import { cleanupResources } from "../shared/process/cleanupResources";
import { GatewayIntentBits, Options, Partials } from "discord.js";
import { DuneApi } from "../infrastructure/http/dune-console/DuneApi";
import { DiscordAdapterClient } from "../infrastructure/http/discord-adapter/DiscordAdapterClient";
import { ConvoyClient } from "../infrastructure/http/convoy/ConvoyClient";
import { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";
import { createLogger, createSapphireLogger } from "./logger";
import { getBotVersion } from "../infrastructure/config/version";
import { InMemoryRateLimitStore, RateLimiter } from "../infrastructure/rate-limit/InMemoryRateLimiter";
import { TicketRepository, type DatabasePoolOptions } from "../infrastructure/database/tickets/TicketRepository";
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
import { HoneypotService } from "../modules/moderation/honeypot/HoneypotService";
import { HoneypotRepository } from "../infrastructure/database/honeypot/HoneypotRepository";
import { RuntimeMonitor } from "../modules/system/RuntimeMonitor";
import { retryWithBackoff } from "../shared/async/retryWithBackoff";
import { runMigrations, SchemaTooNewError } from "../infrastructure/database/migrations/MigrationRunner";
import { MIGRATIONS } from "../infrastructure/database/migrations/migrations";
import type { HoneypotConfig } from "../infrastructure/config/honeypot";
import type { SuggestionConfig } from "../infrastructure/config/suggestions";
import { SuggestionRepository } from "../infrastructure/database/suggestions/SuggestionRepository";
import { SuggestionService } from "../modules/community/suggestions/SuggestionService";
import { SuggestionAutopilot } from "../modules/community/suggestions/SuggestionAutopilot";
import { GitHubActivityClient } from "../infrastructure/http/github/GitHubActivityClient";
import type { ChatbotConfig } from "../infrastructure/config/chatbot";
import { ChatbotRepository } from "../infrastructure/database/chatbot/ChatbotRepository";
import { ChatbotService } from "../modules/community/chatbot/ChatbotService";
import { WebLookupClient } from "../infrastructure/http/web/WebLookupClient";

type BotClient = ArrakisClient;

interface BotConfig {
  honeypot?: HoneypotConfig;
  music?: MusicConfig;
  voiceSetup?: VoiceSetupConfig;
  voicePanelPublic?: boolean;
  chatBridge?: ChatBridgeConfig;
  levelingEnabled: boolean;
  levelRoles: Readonly<LevelRoleConfig>;
  staffApplications?: StaffApplicationConfig;
  suggestions?: SuggestionConfig;
  suggestionsGitHubToken?: string;
  chatbot?: ChatbotConfig;
  logLevel?: string;
  duneConsoleApiKey: string;
  duneConsoleTimeoutMs?: number;
  duneConsoleUrl: string;
  discordToken: string;
  clientId?: string | null;
  allowedGuildIds?: readonly string[];
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
  databaseSslVerify?: boolean;
  databasePoolMax?: number;
  databaseBackgroundPoolMax?: number;
  databaseStatementTimeoutMs?: number;
  messageArchiveRetentionDays?: number;
  runtimeMetricsIntervalSeconds?: number;
  healthFile?: string;
  versionAnnouncementIntervalMinutes?: number;
  dashboardUrl?: string;
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

  systemLogger.header(`ARRAKIS CONTROL v${getBotVersion()}`, "Dune: Awakening Bot");

  const client = createClient(config.logLevel);
  const metricsLogger = createLogger("METRICS", config.logLevel);
  const runtimeMonitor = new RuntimeMonitor({
    gatewayReady: () => client.isReady(),
    gatewayPingMs: () => (client.ws.ping >= 0 ? client.ws.ping : null),
    databasePing: config.databaseUrl ? () => client.tickets?.ping() ?? Promise.resolve() : undefined,
    poolStats: () => client.tickets?.stats() ?? { interactive: { total: 0, idle: 0, waiting: 0 }, background: { total: 0, idle: 0, waiting: 0 } },
    archiveBuffered: () => client.messageArchive?.bufferedCount ?? 0,
    openCircuits: () => [...client.duneApi.openCircuits.map((area) => `dune:${area}`), ...(client.convoyApi?.openCircuits ?? []).map((area) => `convoy:${area}`)],
    cachedMessages: () => client.channels.cache.reduce((total, channel) => total + (channel.isTextBased() ? channel.messages.cache.size : 0), 0),
  }, {
    intervalMs: (config.runtimeMetricsIntervalSeconds ?? 60) * 1_000,
    healthFile: config.healthFile,
    info: (message) => metricsLogger.info(message),
    warn: (message) => metricsLogger.warn(message),
    debug: (message) => metricsLogger.debug(message),
  });

  configureIntegrations(client, config, (error, pool) => {
    runtimeMonitor.recordDatabaseError();
    storageLogger.warn(`A ${pool} PostgreSQL connection failed and was dropped; the next query reconnects. ${error.message}`);
  });
  client.rest.on("rateLimited", () => runtimeMonitor.recordRateLimit());

  systemLogger.info("[01] Loading commands, events and integrations.");

  configLogger.info(
    `Links:${client.discordAdapter ? "on" : "off"} | Chat:${client.chatBridge ? "on" : "off"} | Voice:${client.voiceRooms ? "on" : "off"} | Music:${client.music ? "on" : "off"} | Levels:${client.leveling ? "on" : "off"} | Suggestions:${client.suggestions ? "on" : "off"} | Chatbot:${client.chatbot ? client.chatbot.config.access : "off"} | Archive:${client.messageArchive ? "on" : "off"} | Honeypot:${client.honeypot ? client.honeypot.config.action : "off"}`,
  );
  configLogger.info(client.honeypot ? `Honeypot enabled: action=${client.honeypot.config.action}, channel=${client.honeypot.config.channelId}.` : "Honeypot disabled: configure HONEYPOT_CHANNEL_ID and HONEYPOT_LOG_CHANNEL_ID to enable the panel.");

  let isShuttingDown = false;

  async function start(): Promise<void> {
    storageLogger.info("[02] Preparing persistent state.");
    // Every initializer is idempotent, so an unreachable database is retried with backoff
    // instead of crash-looping the container.
    await retryWithBackoff(async () => {
      if (client.tickets) {
        await runMigrations(client.tickets.pool, MIGRATIONS, { info: (message) => storageLogger.info(message) });
        await client.tickets.initialize();
        storageLogger.debug("PostgreSQL ticket storage is ready.");
      }
      await client.voiceRooms?.initialize();
      await client.music?.initialize();
      await client.leveling?.initialize();
      await client.staffApplications?.initialize();
      await client.suggestions?.initialize();
      await client.chatbot?.initialize();
      await client.messageArchive?.initialize();
    }, {
      shouldStop: () => isShuttingDown,
      retryIf: (error) => !(error instanceof SchemaTooNewError),
      onRetry: (error, attempt, delayMs) => storageLogger.warn(`PostgreSQL is not ready (attempt ${attempt}); retrying in ${Math.round(delayMs / 1_000)}s. ${error instanceof Error ? error.message : String(error)}`),
    });
    const archiveLogger = createLogger("MESSAGE ARCHIVE", config.logLevel);
    client.messageArchive?.start((message, error) => archiveLogger.error(message, error), config.messageArchiveRetentionDays ?? 0);
    await client.honeypot?.initialize();

    storageLogger.info(`${client.tickets ? "PostgreSQL initialized" : "Not configured"}.`);
    configLogger.debug(`Dune Console API key configured; ${client.duneApi.endpoints.length} endpoints catalogued.`);
    discordLogger.info("[03] Connecting to the gateway.");

    await client.login(config.discordToken);
    runtimeMonitor.start();

    discordLogger.debug("Discord login request completed.");
  }

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    systemLogger.debug(`Received ${signal}; starting graceful shutdown.`);

    runtimeMonitor.stop();
    if (client.auditLogInterval) clearInterval(client.auditLogInterval);
    if (client.presenceInterval) clearInterval(client.presenceInterval);
    if (client.versionAnnouncementInterval) clearInterval(client.versionAnnouncementInterval);
    if (client.stormAnnouncementInterval) clearInterval(client.stormAnnouncementInterval);

    // Dev note: Share one stop promise; asking the DJ twice does not make teardown a duet.
    const stopMusic = client.music?.stop() ?? Promise.resolve();
    client.leveling?.stop();
    client.suggestions?.stop();
    client.chatbot?.stop();
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
              await client.messageArchive?.stop();
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
    // Generated and external text must never ping; intentional pings opt in per message.
    allowedMentions: { parse: [] },
    // Bound per-channel message caches; edit and delete history comes from the PostgreSQL archive.
    makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 100 }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 300, lifetime: 1_800 },
    },
    logger: { instance: createSapphireLogger("SAPPHIRE", logLevel) },
  });
}

function configureIntegrations(client: BotClient, config: BotConfig, onDatabaseConnectionError: DatabasePoolOptions["onConnectionError"]): void {
  client.allowedGuildIds = config.allowedGuildIds ?? [];
  client.duneApi = new DuneApi(config.duneConsoleUrl, config.duneConsoleApiKey, { timeoutMs: config.duneConsoleTimeoutMs });
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
  client.tickets = config.databaseUrl ? new TicketRepository(config.databaseUrl, config.databaseSsl, config.databaseSslVerify ?? true, {
    max: config.databasePoolMax, backgroundMax: config.databaseBackgroundPoolMax, statementTimeoutMs: config.databaseStatementTimeoutMs,
    onConnectionError: onDatabaseConnectionError,
  }) : null;
  client.dashboardChangelog = config.dashboardUrl ? new DashboardChangelogClient(config.dashboardUrl) : undefined;
  client.panelStorage = client.tickets ? new PanelRepository(client.tickets.pool) : undefined;
  client.releaseAnnouncements = client.tickets ? new ReleaseAnnouncementRepository(client.tickets.pool) : undefined;
  client.honeypot = config.honeypot ? new HoneypotService(client, config.honeypot, client.tickets ? new HoneypotRepository(client.tickets.pool) : undefined) : undefined;
  client.voiceRooms = client.tickets ? new VoiceService(client, new VoiceRepository(client.tickets.pool), config.voicePanelPublic ?? true, config.voiceSetup) : undefined;
  const levelingLogger = createLogger("LEVELING", config.logLevel);
  client.leveling = config.levelingEnabled && client.tickets ? new LevelingService(client, new LevelRepository(client.tickets.backgroundPool), config.levelRoles, (message, error) => levelingLogger.error(message, error)) : undefined;
  client.staffApplications = config.staffApplications && client.tickets ? new StaffApplicationService(client, new StaffApplicationRepository(client.tickets.pool), config.staffApplications) : undefined;
  const suggestionLogger = createLogger("SUGGESTIONS", config.logLevel);
  const suggestionLog = {
    info: (message: string) => suggestionLogger.info(message),
    warn: (message: string) => suggestionLogger.warn(message),
    error: (message: string, error?: unknown) => suggestionLogger.error(message, error),
  };
  const suggestionStorage = client.tickets ? new SuggestionRepository(client.tickets.pool) : undefined;
  client.suggestions = config.suggestions && suggestionStorage ? new SuggestionService(client, config.suggestions, suggestionStorage, suggestionLog) : undefined;
  if (client.suggestions && suggestionStorage && config.suggestions?.autopilot && config.suggestions.githubRepos.length) {
    client.suggestions.attach(new SuggestionAutopilot(client.suggestions, new GitHubActivityClient(config.suggestionsGitHubToken), suggestionStorage, {
      repos: config.suggestions.githubRepos,
      intervalMs: config.suggestions.githubIntervalMinutes * 60_000,
      threshold: config.suggestions.autopilotThreshold,
    }, suggestionLog));
  }
  const chatbotLogger = createLogger("CHATBOT", config.logLevel);
  client.chatbot = config.chatbot ? new ChatbotService(client, config.chatbot, client.tickets ? new ChatbotRepository(client.tickets.pool) : undefined, {
    info: (message: string) => chatbotLogger.info(message),
    warn: (message: string) => chatbotLogger.warn(message),
    error: (message: string, error?: unknown) => chatbotLogger.error(message, error),
  }, Date.now, config.chatbot.web ? new WebLookupClient({
    wikiUrl: config.chatbot.webWikiUrl,
    perMinute: config.chatbot.webPerMinute,
    userAgent: `ArrakisControlBot/${getBotVersion()} (Discord community bot)`,
  }) : undefined) : undefined;
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
  client.messageArchive = client.tickets ? new MessageArchiveService(new MessageArchiveRepository(client.tickets.backgroundPool), client.auditLogger) : undefined;
}

export { createBotApplication };
