import { afterEach, describe, expect, it, vi } from "vitest";
import { LogLevel } from "@sapphire/framework";

import { createLogger, createSapphireLogger } from "../../src/client/logger";

function stripAnsi(value: string): string {
  return value
    .split(String.fromCharCode(27))
    .map((part) => part.replace(/^\[[0-9;]*m/, ""))
    .join("");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Sapphire logger adapter", () => {
  it("formats framework messages with the Arrakis timestamp, level, and scope", () => {
    const output: unknown[][] = [];
    vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => {
      output.push(values);
    });

    const logger = createSapphireLogger("BOT", "INFO");
    logger.info("ApplicationCommandRegistries:", "Initializing...");

    expect(output).toHaveLength(1);
    expect(stripAnsi(String(output[0]?.[0]))).toMatch(
      /^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} [AP]M\] \[INFO\] \[BOT\] ApplicationCommandRegistries: Initializing\.\.\.$/,
    );
  });

  it("honors the configured Sapphire log threshold", () => {
    const logger = createSapphireLogger("BOT", "WARN");

    expect(logger.has(LogLevel.Debug)).toBe(false);
    expect(logger.has(LogLevel.Info)).toBe(false);
    expect(logger.has(LogLevel.Warn)).toBe(true);
    expect(logger.has(LogLevel.Error)).toBe(true);
    expect(logger.has(LogLevel.None)).toBe(false);
  });
});


describe("startup presentation", () => {
  it("keeps redirected logs plain and preserves warning severity", () => {
    vi.stubEnv("NO_COLOR", "1");
    vi.stubEnv("FORCE_COLOR", "1");
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createLogger("BOT", "INFO");
    logger.header("ARRAKIS CONTROL");
    logger.warn("Music unavailable; retrying.");
    expect(output.mock.calls.flat().join("\n")).not.toContain(String.fromCharCode(27));
    expect(output.mock.calls.flat().join("\n")).toContain("THE SPICE FLOWS");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("[WARN] [BOT] Music unavailable; retrying."));
  });

  it("does not print the startup banner at warning-only verbosity", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    createLogger("BOT", "WARN").header("ARRAKIS CONTROL");
    expect(output).not.toHaveBeenCalled();
  });
});
