import { afterEach, describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/infrastructure/config/environment";

afterEach(() => {
  for (const key of ["TOKEN", "CONSOLE_URL", "CONSOLE_PASSWORD", "NODE_ENV", "LOG_LEVEL", "TOTAL_SHARDS", "CLIENT_ID"]) {
    delete process.env[key];
  }
});

describe("loadEnvironment", () => {
  it("fails when required credentials are missing", () => {
    expect(() => loadEnvironment(["__ARRAKIS_TEST_REQUIRED_KEY__"])).toThrow("Missing required environment variable");
  });

  it("rejects insecure console URLs in production", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "http://localhost:3000";
    process.env.CONSOLE_PASSWORD = "password";
    process.env.NODE_ENV = "production";

    expect(() => loadEnvironment()).toThrow("CONSOLE_URL must use HTTPS in production");
  });

  it("rejects invalid shard counts and Discord IDs", () => {
    process.env.TOKEN = "token";
    process.env.CONSOLE_URL = "https://localhost:3000";
    process.env.CONSOLE_PASSWORD = "password";
    process.env.TOTAL_SHARDS = "0";

    expect(() => loadEnvironment()).toThrow("TOTAL_SHARDS must be a positive integer");

    process.env.TOTAL_SHARDS = "auto";
    process.env.CLIENT_ID = "invalid";

    expect(() => loadEnvironment()).toThrow("CLIENT_ID must be a valid Discord ID");
  });
});
