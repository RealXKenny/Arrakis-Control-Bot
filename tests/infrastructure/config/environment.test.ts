import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadEnvironment } from "../../../src/infrastructure/config/environment";

const TEST_ENVIRONMENT_KEYS = ["STAFF_APPLICATION_PANEL_CHANNEL_ID", "STAFF_APPLICATION_REVIEW_CHANNEL_ID", "STAFF_APPLICATION_REVIEWER_ROLE_ID", "STAFF_APPLICATION_PENDING_ROLE_ID", "STAFF_APPLICATION_ACCEPTED_ROLE_ID", "STAFF_APPLICATION_COOLDOWN_DAYS", "LAVALINK_URL", "LAVALINK_PASSWORD", "MUSIC_GUILD_ID", "MUSIC_VOICE_CHANNEL_ID", "MUSIC_REQUEST_CHANNEL_ID", "MUSIC_IDLE_PLAYLIST_URL", "MUSIC_SEARCH_SOURCE", "MUSIC_VOLUME", "MUSIC_MAX_QUEUE", "VOICE_GUILD_ID", "VOICE_JOIN_CHANNEL_ID", "VOICE_CATEGORY_ID", "VOICE_PANEL_CHANNEL_ID", "VOICE_PANEL_PUBLIC", "LEVELING_ENABLED", "LEVEL_ANNOUNCEMENT_CHANNEL_ID", "LEVEL_ROLE_ARRAKIS_WANDERER_ID", "LEVEL_ROLE_SIETCH_DWELLER_ID", "LEVEL_ROLE_DESERT_SURVIVOR_ID", "LEVEL_ROLE_SAND_WARRIOR_ID", "LEVEL_ROLE_SPICE_HUNTER_ID", "LEVEL_ROLE_FREMEN_INITIATE_ID", "LEVEL_ROLE_DESERT_MASTER_ID", "LEVEL_ROLE_CHOSEN_OF_ARRAKIS_ID", "TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY", "NODE_ENV", "LOG_LEVEL", "TOTAL_SHARDS", "CLIENT_ID", "GUILD_ID", "DATABASE_URL", "DATABASE_SSL", "TICKET_PANEL_CHANNEL_ID", "BOT_CONTROL_CHANNEL_ID", "TICKET_CATEGORY_ID", "TICKET_TRANSCRIPT_CHANNEL_ID"] as const;

beforeEach(clearTestEnvironment);
afterEach(() => {
  clearTestEnvironment();
  vi.unstubAllEnvs();
});

function clearTestEnvironment(): void {
  for (const key of TEST_ENVIRONMENT_KEYS) {
    delete process.env[key];
  }
}

describe("loadEnvironment", () => {
  it("fails when required credentials are missing", () => {
    expect(() => loadEnvironment(["__ARRAKIS_TEST_REQUIRED_KEY__"])).toThrow("Missing required environment variable");
  });

  it("rejects insecure console URLs in production", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "http://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.NODE_ENV = "production";

    expect(() => loadEnvironment()).toThrow("CONSOLE_URL must use HTTPS in production");
  });

  it("rejects invalid shard counts and Discord IDs", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.TOTAL_SHARDS = "0";

    expect(() => loadEnvironment()).toThrow("TOTAL_SHARDS must be a positive integer");

    process.env.TOTAL_SHARDS = "auto";
    process.env.CLIENT_ID = "invalid";

    expect(() => loadEnvironment()).toThrow("CLIENT_ID must be a valid Discord ID");
  });

  it("accepts blank optional level roles and validates configured role IDs", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.LEVEL_ROLE_ARRAKIS_WANDERER_ID = "";
    expect(() => loadEnvironment()).not.toThrow();
    process.env.LEVEL_ROLE_ARRAKIS_WANDERER_ID = "invalid";
    expect(() => loadEnvironment()).toThrow("LEVEL_ROLE_ARRAKIS_WANDERER_ID must be a valid Discord ID");
  });

  it("validates the optional level announcement channel ID", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.LEVEL_ANNOUNCEMENT_CHANNEL_ID = "invalid";
    expect(() => loadEnvironment()).toThrow("LEVEL_ANNOUNCEMENT_CHANNEL_ID must be a valid Discord ID");
  });

  it("loads and validates the private bot control channel", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.BOT_CONTROL_CHANNEL_ID = "123456789012345678";
    expect(loadEnvironment().discordBotControlChannelId).toBe("123456789012345678");
    process.env.BOT_CONTROL_CHANNEL_ID = "not-a-channel";
    expect(() => loadEnvironment()).toThrow("BOT_CONTROL_CHANNEL_ID must be a valid Discord ID");
  });

  it("ignores GitHub Actions IDs that are not Discord configuration", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    vi.stubEnv("GITHUB_REPOSITORY_OWNER_ID", "1234567");

    expect(() => loadEnvironment()).not.toThrow();
  });

  it("parses PostgreSQL SSL configuration", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.DATABASE_SSL = "yes";

    expect(loadEnvironment().databaseSsl).toBe(true);

    process.env.DATABASE_SSL = "sometimes";

    expect(() => loadEnvironment()).toThrow("DATABASE_SSL must be true or false");
  });

  it("enables leveling with PostgreSQL and allows it to be disabled explicitly", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.DATABASE_URL = "postgresql://localhost/bot";

    expect(loadEnvironment().levelingEnabled).toBe(true);
    process.env.LEVELING_ENABLED = "false";
    expect(loadEnvironment().levelingEnabled).toBe(false);
  });

  it("requires PostgreSQL when leveling is explicitly enabled", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.LEVELING_ENABLED = "true";

    expect(() => loadEnvironment()).toThrow("DATABASE_URL is required when community leveling is enabled");
  });

  it("rejects non-PostgreSQL database URLs", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.DATABASE_URL = "https://database.example.com";

    expect(() => loadEnvironment()).toThrow("DATABASE_URL must use the postgres or postgresql protocol");
  });

  it("accepts and trims the required scoped Console API key", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "  dune-key  ";

    expect(loadEnvironment()).toMatchObject({
      duneConsoleApiKey: "dune-key",
    });
  });

  it("requires a Console API key", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";

    expect(() => loadEnvironment()).toThrow("CONSOLE_API_KEY is required");
  });

  it("rejects embedded Console URL credentials", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://user:secret@console.example.com";
    process.env.CONSOLE_API_KEY = "dune-key";

    expect(() => loadEnvironment()).toThrow("CONSOLE_URL must not contain embedded credentials");
  });

  it("loads complete staff application configuration and requires PostgreSQL", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.STAFF_APPLICATION_PANEL_CHANNEL_ID = "123456789012345678";
    process.env.STAFF_APPLICATION_REVIEW_CHANNEL_ID = "223456789012345678";
    expect(() => loadEnvironment()).toThrow("DATABASE_URL is required when staff applications are enabled");
    process.env.DATABASE_URL = "postgresql://arrakis:test@localhost/arrakis";
    expect(loadEnvironment().staffApplications).toMatchObject({ panelChannelId: "123456789012345678", reviewChannelId: "223456789012345678", cooldownDays: 7 });
  });

  it("rejects partial or invalid staff application configuration", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.STAFF_APPLICATION_PANEL_CHANNEL_ID = "123456789012345678";
    expect(() => loadEnvironment()).toThrow("must both be configured");
    process.env.STAFF_APPLICATION_REVIEW_CHANNEL_ID = "bad-id";
    expect(() => loadEnvironment()).toThrow("STAFF_APPLICATION_REVIEW_CHANNEL_ID must be a valid Discord ID");
  });
});
