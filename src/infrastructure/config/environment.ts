import dotenv from "dotenv";
import { loadHoneypotConfig, type HoneypotConfig } from "./honeypot";
import path from "node:path";
import { loadChatBridgeConfig, type ChatBridgeConfig } from "./chatBridge";
import { loadVoiceSetup, type VoiceSetupConfig } from "./voiceRooms";
import { loadMusicConfig, type MusicConfig } from "./music";
import { loadLevelRoleConfig, type LevelRoleConfig } from "./leveling";
import { loadStaffApplicationConfig, type StaffApplicationConfig } from "./staffApplications";
import { DashboardChangelogClient } from "../http/dashboard/DashboardChangelogClient";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  // The bot prints its own startup log; dotenv's "injected env" banner would break the clean console.
  quiet: true,
});

interface EnvironmentConfig {
  honeypot?: HoneypotConfig;
  music?: MusicConfig;
  voiceSetup?: VoiceSetupConfig;
  voicePanelPublic: boolean;
  chatBridge?: ChatBridgeConfig;
  levelingEnabled: boolean;
  levelRoles: Readonly<LevelRoleConfig>;
  staffApplications?: StaffApplicationConfig;
  discordToken: string;
  clientId?: string;
  guildId?: string;
  allowedGuildIds: readonly string[];
  totalShards: number | "auto";
  duneConsoleUrl: string;
  advinApiKey?: string;
  advinApiUrl: string;
  duneConsoleApiKey: string;
  /** Per-attempt Console request timeout (CONSOLE_TIMEOUT_MS, 1000-120000, default 30000). */
  duneConsoleTimeoutMs: number;
  duneDiscordAdapterToken?: string;
  duneDiscordLinkPanelChannelId?: string;
  duneDiscordBlueprintPanelChannelId?: string;
  duneDiscordAuditChannelId?: string;
  duneDiscordActivityLogChannelId?: string;
  discordRolePanelChannelId?: string;
  discordVerifyChannelId?: string;
  discordRulesChannelId?: string;
  discordServerInfoChannelId?: string;
  discordFaqPanelChannelId?: string;
  discordAnnouncementChannelId?: string;
  discordTicketPanelChannelId?: string;
  discordBotControlChannelId?: string;
  discordTicketCategoryId?: string;
  discordTicketTranscriptChannelId?: string;
  databaseUrl?: string;
  databaseSsl: boolean;
  databaseSslVerify: boolean;
  databasePoolMax: number;
  databaseBackgroundPoolMax: number;
  databaseStatementTimeoutMs: number;
  messageArchiveRetentionDays: number;
  runtimeMetricsIntervalSeconds: number;
  healthFile?: string;
  versionAnnouncementIntervalMinutes: number;
  dashboardUrl?: string;
  interactionCooldownMs: number;
  rateLimitMaxEntries: number;
  logLevel: string;
}

const DISCORD_ID_ENV_KEYS = [
  "CLIENT_ID",
  "GUILD_ID",
  "LINK_PANEL_CHANNEL_ID",
  "BLUEPRINT_PANEL_CHANNEL_ID",
  "ROLE_PANEL_CHANNEL_ID",
  "VERIFY_CHANNEL_ID",
  "RULES_CHANNEL_ID",
  "SERVER_INFO_CHANNEL_ID",
  "FAQ_PANEL_CHANNEL_ID",
  "ANNOUNCEMENT_CHANNEL_ID",
  "TICKET_PANEL_CHANNEL_ID",
  "BOT_CONTROL_CHANNEL_ID",
  "STAFF_APPLICATION_PANEL_CHANNEL_ID",
  "STAFF_APPLICATION_REVIEW_CHANNEL_ID",
  "TICKET_CATEGORY_ID",
  "TICKET_TRANSCRIPT_CHANNEL_ID",
  "STORM_CHANNEL_ID",
  "WELCOME_CHANNEL_ID",
  "GOODBYE_CHANNEL_ID",
  "AUDIT_CHANNEL_ID",
  "ACTIVITY_LOG_CHANNEL_ID",
  "LINKED_PLAYER_ROLE_ID",
  "VERIFIED_MEMBER_ROLE_ID",
  "TRIAL_STAFF_ROLE_ID",
  "MODERATOR_ROLE_ID",
  "SENIOR_MODERATOR_ROLE_ID",
  "ADMINISTRATOR_ROLE_ID",
  "HEAD_ADMINISTRATOR_ROLE_ID",
  "OWNER_ROLE_ID",
  "STAFF_APPLICATION_REVIEWER_ROLE_ID",
  "STAFF_APPLICATION_PENDING_ROLE_ID",
  "STAFF_APPLICATION_ACCEPTED_ROLE_ID",
  "LEVEL_ANNOUNCEMENT_CHANNEL_ID",
  "LEVEL_ROLE_ARRAKIS_WANDERER_ID",
  "LEVEL_ROLE_SIETCH_DWELLER_ID",
  "LEVEL_ROLE_DESERT_SURVIVOR_ID",
  "LEVEL_ROLE_SAND_WARRIOR_ID",
  "LEVEL_ROLE_SPICE_HUNTER_ID",
  "LEVEL_ROLE_FREMEN_INITIATE_ID",
  "LEVEL_ROLE_DESERT_MASTER_ID",
  "LEVEL_ROLE_CHOSEN_OF_ARRAKIS_ID",
  "ROLE_PVP_ID",
  "ROLE_PVE_ID",
  "ROLE_BUILDER_ID",
  "ROLE_CRAFTER_ID",
  "ROLE_TRADER_ID",
  "ROLE_EXPLORER_ID",
  "ROLE_ENDGAME_ID",
  "ROLE_ATREIDES_ID",
  "ROLE_HARKONNEN_ID",
  "ROLE_FREMEN_ID",
  "ROLE_NEUTRAL_ID",
  "ROLE_ANNOUNCEMENTS_ID",
  "ROLE_EVENTS_ID",
  "ROLE_PVP_ALERTS_ID",
  "ROLE_MARKET_ALERTS_ID",
  "ROLE_LFG_ALERTS_ID",
  "VOICE_GUILD_ID",
  "VOICE_JOIN_CHANNEL_ID",
  "VOICE_CATEGORY_ID",
  "VOICE_PANEL_CHANNEL_ID",
  "MUSIC_GUILD_ID",
  "MUSIC_VOICE_CHANNEL_ID",
  "MUSIC_REQUEST_CHANNEL_ID",
] as const;

function loadEnvironment(requiredKeys: readonly string[] = []): Readonly<EnvironmentConfig> {
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missingKeys.join(", ")}`);
  }

  const discordToken = process.env.TOKEN;
  const duneConsoleUrl = process.env.CONSOLE_URL;
  const duneConsoleApiKey = process.env.CONSOLE_API_KEY?.trim() || undefined;
  const dashboardUrl = process.env.DASHBOARD_URL?.trim() || undefined;
  if (dashboardUrl) {
    try { new DashboardChangelogClient(dashboardUrl); } catch { throw new Error("DASHBOARD_URL must be an HTTPS origin without credentials."); }
  }

  if (!discordToken || !duneConsoleUrl) {
    throw new Error("Required environment variables are missing.");
  }

  if (!duneConsoleApiKey) {
    throw new Error("CONSOLE_API_KEY is required.");
  }

  validateUrl(duneConsoleUrl, "CONSOLE_URL");
  validateNoUrlCredentials(duneConsoleUrl, "CONSOLE_URL");

  // Dev note: GitHub owns IDs too; validate only the snowflakes this bot consumes.
  for (const name of DISCORD_ID_ENV_KEYS) {
    validateOptionalSnowflake(process.env[name], name);
  }

  const totalShards = parseShardCount(process.env.TOTAL_SHARDS);

  const versionAnnouncementIntervalMinutes = Number(process.env.VERSION_ANNOUNCEMENT_INTERVAL_MINUTES ?? 5);

  if (!Number.isFinite(versionAnnouncementIntervalMinutes) || versionAnnouncementIntervalMinutes <= 0) {
    throw new Error("VERSION_ANNOUNCEMENT_INTERVAL_MINUTES must be a positive number.");
  }

  const interactionCooldownMs = parsePositiveNumber(process.env.INTERACTION_COOLDOWN_MS, 2_000, "INTERACTION_COOLDOWN_MS");
  const rateLimitMaxEntries = parsePositiveInteger(process.env.RATE_LIMIT_MAX_ENTRIES, 10_000, "RATE_LIMIT_MAX_ENTRIES");

  if (process.env.API_URL) {
    validateUrl(process.env.API_URL, "API_URL");
  }

  if (process.env.DATABASE_URL) {
    validateDatabaseUrl(process.env.DATABASE_URL);
  }

  const databaseSsl = parseBoolean(process.env.DATABASE_SSL, false, "DATABASE_SSL");
  const databaseSslVerify = parseBoolean(process.env.DATABASE_SSL_VERIFY, true, "DATABASE_SSL_VERIFY");
  const levelingEnabled = parseBoolean(process.env.LEVELING_ENABLED, Boolean(process.env.DATABASE_URL), "LEVELING_ENABLED");

  if (levelingEnabled && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when community leveling is enabled.");
  }
  const staffApplications = loadStaffApplicationConfig(process.env);
  if (staffApplications && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when staff applications are enabled.");

  const logLevel = (process.env.LOG_LEVEL ?? "INFO").toUpperCase();

  if (!(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const).includes(logLevel as never)) {
    throw new Error("LOG_LEVEL must be one of DEBUG, INFO, WARN, ERROR, or FATAL.");
  }

  return Object.freeze({
    honeypot: loadHoneypotConfig(process.env),
    music: loadMusicConfig(process.env),
    voiceSetup: loadVoiceSetup(process.env),
    voicePanelPublic: parseBoolean(process.env.VOICE_PANEL_PUBLIC, true, "VOICE_PANEL_PUBLIC"),
    chatBridge: loadChatBridgeConfig(process.env),
    levelingEnabled,
    levelRoles: loadLevelRoleConfig(process.env),
    staffApplications,
    discordToken,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    allowedGuildIds: parseAllowedGuildIds(process.env.ALLOWED_GUILD_IDS, process.env.GUILD_ID),
    totalShards,
    duneConsoleUrl,
    advinApiKey: process.env.API_KEY,
    advinApiUrl: process.env.API_URL ?? "https://vps.example.com",
    duneConsoleApiKey,
    duneConsoleTimeoutMs: parseBoundedInteger(process.env.CONSOLE_TIMEOUT_MS, 30_000, 1_000, 120_000, "CONSOLE_TIMEOUT_MS"),
    duneDiscordAdapterToken: process.env.ADAPTER_TOKEN,
    duneDiscordLinkPanelChannelId: process.env.LINK_PANEL_CHANNEL_ID,
    duneDiscordBlueprintPanelChannelId: process.env.BLUEPRINT_PANEL_CHANNEL_ID,
    duneDiscordAuditChannelId: process.env.AUDIT_CHANNEL_ID,
    duneDiscordActivityLogChannelId: process.env.ACTIVITY_LOG_CHANNEL_ID,
    discordRolePanelChannelId: process.env.ROLE_PANEL_CHANNEL_ID,
    discordVerifyChannelId: process.env.VERIFY_CHANNEL_ID,
    discordRulesChannelId: process.env.RULES_CHANNEL_ID,
    discordServerInfoChannelId: process.env.SERVER_INFO_CHANNEL_ID,
    discordFaqPanelChannelId: process.env.FAQ_PANEL_CHANNEL_ID,
    discordAnnouncementChannelId: process.env.ANNOUNCEMENT_CHANNEL_ID,
    discordTicketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID,
    discordBotControlChannelId: process.env.BOT_CONTROL_CHANNEL_ID,
    discordTicketCategoryId: process.env.TICKET_CATEGORY_ID,
    discordTicketTranscriptChannelId: process.env.TICKET_TRANSCRIPT_CHANNEL_ID,
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl,
    databaseSslVerify,
    databasePoolMax: parsePositiveInteger(process.env.DATABASE_POOL_MAX, 10, "DATABASE_POOL_MAX"),
    databaseBackgroundPoolMax: parsePositiveInteger(process.env.DATABASE_BACKGROUND_POOL_MAX, 5, "DATABASE_BACKGROUND_POOL_MAX"),
    databaseStatementTimeoutMs: parsePositiveInteger(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 15_000, "DATABASE_STATEMENT_TIMEOUT_MS"),
    messageArchiveRetentionDays: parseRetentionDays(process.env.MESSAGE_ARCHIVE_RETENTION_DAYS),
    runtimeMetricsIntervalSeconds: parseMetricsInterval(process.env.RUNTIME_METRICS_INTERVAL_SECONDS),
    healthFile: process.env.HEALTH_FILE?.trim() || undefined,
    versionAnnouncementIntervalMinutes,
    dashboardUrl,
    interactionCooldownMs,
    rateLimitMaxEntries,
    logLevel,
  });
}

/** Guilds the bot may serve. Defaults to GUILD_ID; empty means any guild. */
function parseAllowedGuildIds(value: string | undefined, guildId: string | undefined): readonly string[] {
  const ids = (value?.trim() ? value : guildId ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  for (const id of ids) {
    if (!/^\d{17,20}$/.test(id)) throw new Error("ALLOWED_GUILD_IDS must be a comma-separated list of Discord server IDs.");
  }
  return Object.freeze([...new Set(ids)]);
}

/** 0 or empty keeps archived messages forever. */
function parseMetricsInterval(value: string | undefined): number {
  if (!value?.trim()) return 60;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw new Error("RUNTIME_METRICS_INTERVAL_SECONDS must be a whole number from 0 to 3600.");
  return seconds;
}

function parseRetentionDays(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error("MESSAGE_ARCHIVE_RETENTION_DAYS must be a whole number of days from 0 to 3650.");
  return days;
}

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  throw new Error(`${name} must be true or false.`);
}

function parseShardCount(value: string | undefined): number | "auto" {
  const normalized = value?.trim().toLowerCase();

  // One guild always lands on one shard, so a second shard only adds a gateway connection.
  if (!normalized) return 1;
  if (normalized === "auto") return "auto";

  return parsePositiveInteger(normalized, 0, "TOTAL_SHARDS");
}

function parsePositiveNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value || fallback);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const parsed = parsePositiveInteger(value, fallback, name);
  if (parsed < min || parsed > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return parsed;
}

function validateOptionalSnowflake(value: string | undefined, name: string): void {
  if (value !== undefined && value.trim() !== "" && !/^\d{17,20}$/.test(value.trim())) {
    throw new Error(`${name} must be a valid Discord ID.`);
  }
}

function validateUrl(value: string, name: string): void {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error(`${name} must use HTTPS in production.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("must use HTTPS")) {
      throw error;
    }

    // eslint-disable-next-line preserve-caught-error -- the URL parser error carries the raw URL, which may hold credentials.
    throw new Error(`${name} must be a valid URL.`);
  }
}

function validateNoUrlCredentials(value: string, name: string): void {
  const url = new URL(value);

  if (url.username || url.password) {
    throw new Error(`${name} must not contain embedded credentials.`);
  }
}

function validateDatabaseUrl(value: string): void {
  try {
    const url = new URL(value);

    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("must use the postgres")) {
      throw error;
    }

    // eslint-disable-next-line preserve-caught-error -- the URL parser error carries the raw URL, which may hold credentials.
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
}

export { loadEnvironment };
