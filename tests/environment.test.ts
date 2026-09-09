import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/infrastructure/config/environment";

const TEST_ENVIRONMENT_KEYS = ["TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY", "NODE_ENV", "LOG_LEVEL", "TOTAL_SHARDS", "CLIENT_ID", "DATABASE_URL", "DATABASE_SSL", "TICKET_PANEL_CHANNEL_ID", "TICKET_CATEGORY_ID", "TICKET_TRANSCRIPT_CHANNEL_ID"] as const;

beforeEach(clearTestEnvironment);
afterEach(clearTestEnvironment);

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

  it("parses PostgreSQL SSL configuration", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_API_KEY = "dune-key";
    process.env.DATABASE_SSL = "yes";

    expect(loadEnvironment().databaseSsl).toBe(true);

    process.env.DATABASE_SSL = "sometimes";

    expect(() => loadEnvironment()).toThrow("DATABASE_SSL must be true or false");
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
});
