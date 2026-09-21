import { afterEach, describe, expect, it, vi } from "vitest";
import { LogLevel } from "@sapphire/framework";

import { compactSapphireMessage, createLogger, createSapphireLogger, fitConsoleLine } from "../../src/client/logger";

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
    expect(stripAnsi(String(output[0]?.[0]))).toMatch(/^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} [AP]M\] ● \[INFO\] \[BOT\] ApplicationCommandRegistries: Initializing\.\.\.$/);
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

  it("compacts Sapphire's global command overwrite report to one useful line", () => {
    expect(compactSapphireMessage("ApplicationCommandRegistries(BulkOverwrite) Successfully overwrote global application commands. The application now has 13 global commands"))
      .toBe("Global application commands synchronized (13).");
  });
});

describe("startup presentation", () => {
  it("fits a colored log to the current terminal width without wrapping", () => {
    const line = "\u001B[32m[INFO]\u001B[0m " + "desert telemetry ".repeat(10);
    const fitted = fitConsoleLine(line, 80);

    expect(stripAnsi(fitted)).toHaveLength(79);
    expect(stripAnsi(fitted)).toMatch(/…$/);
  });

  it("collapses multiline messages before writing them", () => {
    vi.stubEnv("NO_COLOR", "1");
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createLogger("SYSTEM", "INFO").info("First line\nsecond line\tthird line");

    expect(output).toHaveBeenCalledWith(expect.stringContaining("First line second line third line"));
    expect(String(output.mock.calls[0]?.[0])).not.toContain("\n");
  });

  it("uses a safe production width when a container does not expose its terminal size", () => {
    vi.stubEnv("NO_COLOR", "1");
    vi.stubEnv("NODE_ENV", "production");
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createLogger("CONFIG", "INFO").info("service enabled ".repeat(20));

    expect(Array.from(String(output.mock.calls[0]?.[0]))).toHaveLength(119);
    expect(String(output.mock.calls[0]?.[0])).toMatch(/…$/);
  });

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
    expect(output.mock.calls.flat().join("\n")).toContain("Dune: Awakening Bot");
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
