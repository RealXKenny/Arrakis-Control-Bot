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
    vi.spyOn(console, "info").mockImplementation((...values: unknown[]) => {
      output.push(values);
    });

    const logger = createSapphireLogger("BOT", "INFO");
    logger.info("ApplicationCommandRegistries:", "Initializing...");

    expect(output).toHaveLength(1);
    expect(stripAnsi(String(output[0]?.[0]))).toMatch(
      /^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} [AP]M\] ● \[INFO\] \[BOT\] ApplicationCommandRegistries: Initializing\.\.\.$/,
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

  it("creates subsystem loggers without retaining the framework scope", () => {
    vi.stubEnv("NO_COLOR", "1");
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const logger = createSapphireLogger("SAPPHIRE", "INFO");

    logger.scope("GATEWAY").info("Connected.");

    expect(output).toHaveBeenCalledWith(expect.stringContaining("[INFO] [GATEWAY] Connected."));
    expect(output.mock.calls.flat().join(" ")).not.toContain("[SAPPHIRE] Connected.");
  });
});


describe("startup presentation", () => {
  it("keeps redirected logs plain and preserves warning severity", () => {
    vi.stubEnv("NO_COLOR", "1");
    vi.stubEnv("FORCE_COLOR", "1");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createLogger("BOT", "INFO");
    logger.header("ARRAKIS CONTROL");
    logger.warn("Music unavailable; retrying.");
    expect(output.mock.calls.flat().join("\n")).not.toContain(String.fromCharCode(27));
    expect(output.mock.calls.flat().join("\n")).toContain("Dune: Awakening Discord control bot");
    expect(write).toHaveBeenCalledWith("\u001B[2J\u001B[3J\u001B[H");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("▲ [WARN] [BOT] Music unavailable; retrying."));
  });

  it("does not print the startup banner at warning-only verbosity", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    createLogger("BOT", "WARN").header("ARRAKIS CONTROL");
    expect(output).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("formats structured details and redacts nested secrets", () => {
    vi.stubEnv("NO_COLOR", "1");
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createLogger("BOT", "INFO").info("Authenticated.", {
      userId: "123",
      credentials: { accessToken: "do-not-print", label: "Arrakis Control" },
    });

    expect(output).toHaveBeenCalledWith(expect.stringContaining('· {"userId":"123","credentials":{"accessToken":"[REDACTED]","label":"Arrakis Control"}}'));
    expect(output.mock.calls.flat().join(" ")).not.toContain("do-not-print");
  });
});
