import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

interface EnvironmentConfig {
  discordToken: string;
  clientId?: string;
  guildId?: string;
  totalShards: number | "auto";
  duneConsoleUrl: string;
  advinApiKey?: string;
  advinApiUrl: string;
  duneConsoleApiKey: string;
  duneDiscordAdapterToken?: string;
  duneDiscordLinkPanelChannelId?: string;
  duneDiscordBlueprintPanelChannelId?: string;
  duneDiscordAuditChannelId?: string;
  duneDiscordActivityLogChannelId?: string;
  discordRolePanelChannelId?: string;
  discordVerifyChannelId?: string;
  discordRulesChannelId?: string;
  discordServerInfoChannelId?: string;
  discordAnnouncementChannelId?: string;
  discordTicketPanelChannelId?: string;
  discordTicketCategoryId?: string;
  discordTicketTranscriptChannelId?: string;
  databaseUrl?: string;
  databaseSsl: boolean;
  versionAnnouncementIntervalMinutes: number;
  interactionCooldownMs: number;
  rateLimitMaxEntries: number;
  logLevel: string;
}

function loadEnvironment(requiredKeys: readonly string[] = []): Readonly<EnvironmentConfig> {
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missingKeys.join(", ")}`);
  }

  const discordToken = process.env.TOKEN;
  const duneConsoleUrl = process.env.CONSOLE_URL;
  const duneConsoleApiKey = process.env.CONSOLE_API_KEY?.trim() || undefined;

  if (!discordToken || !duneConsoleUrl) {
    throw new Error("Required environment variables are missing.");
  }

  if (!duneConsoleApiKey) {
    throw new Error("CONSOLE_API_KEY is required.");
  }

  validateUrl(duneConsoleUrl, "CONSOLE_URL");
  validateNoUrlCredentials(duneConsoleUrl, "CONSOLE_URL");

  validateOptionalSnowflake(process.env.CLIENT_ID, "CLIENT_ID");
  validateOptionalSnowflake(process.env.GUILD_ID, "GUILD_ID");

  for (const [name, value] of Object.entries(process.env)) {
    if (value && /(?:CHANNEL|ROLE|OWNER)_?ID$/.test(name)) {
      validateOptionalSnowflake(value, name);
    }
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

  const logLevel = (process.env.LOG_LEVEL ?? "INFO").toUpperCase();

  if (!(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const).includes(logLevel as never)) {
    throw new Error("LOG_LEVEL must be one of DEBUG, INFO, WARN, ERROR, or FATAL.");
  }

  return Object.freeze({
    discordToken,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    totalShards,
    duneConsoleUrl,
    advinApiKey: process.env.API_KEY,
    advinApiUrl: process.env.API_URL ?? "https://vps.example.com",
    duneConsoleApiKey,
    duneDiscordAdapterToken: process.env.ADAPTER_TOKEN,
    duneDiscordLinkPanelChannelId: process.env.LINK_PANEL_CHANNEL_ID,
    duneDiscordBlueprintPanelChannelId: process.env.BLUEPRINT_PANEL_CHANNEL_ID,
    duneDiscordAuditChannelId: process.env.AUDIT_CHANNEL_ID,
    duneDiscordActivityLogChannelId: process.env.ACTIVITY_LOG_CHANNEL_ID,
    discordRolePanelChannelId: process.env.ROLE_PANEL_CHANNEL_ID,
    discordVerifyChannelId: process.env.VERIFY_CHANNEL_ID,
    discordRulesChannelId: process.env.RULES_CHANNEL_ID,
    discordServerInfoChannelId: process.env.SERVER_INFO_CHANNEL_ID,
    discordAnnouncementChannelId: process.env.ANNOUNCEMENT_CHANNEL_ID,
    discordTicketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID,
    discordTicketCategoryId: process.env.TICKET_CATEGORY_ID,
    discordTicketTranscriptChannelId: process.env.TICKET_TRANSCRIPT_CHANNEL_ID,
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl,
    versionAnnouncementIntervalMinutes,
    interactionCooldownMs,
    rateLimitMaxEntries,
    logLevel,
  });
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

  if (!normalized || normalized === "auto") {
    return "auto";
  }

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

function validateOptionalSnowflake(value: string | undefined, name: string): void {
  if (value !== undefined && !/^\d{17,20}$/.test(value)) {
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

    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
}

export { loadEnvironment };

export type { EnvironmentConfig };
