import { describe, expect, it } from "vitest";
import { loadHoneypotConfig } from "../../../src/infrastructure/config/honeypot";

const env = { GUILD_ID: "123456789012345678", HONEYPOT_CHANNEL_ID: "223456789012345678", HONEYPOT_LOG_CHANNEL_ID: "323456789012345678" };

describe("honeypot configuration", () => {
  it("stays disabled without channel configuration", () => {
    expect(loadHoneypotConfig({})).toBeUndefined();
    expect(loadHoneypotConfig({ HONEYPOT_CHANNEL_ID: " " })).toBeUndefined();
  });
  it("defaults to ban and supports timeout and log actions", () => {
    expect(loadHoneypotConfig(env)).toMatchObject({ action: "ban", timeoutMinutes: 1440 });
    expect(loadHoneypotConfig({ ...env, HONEYPOT_ACTION: " TIMEOUT ", HONEYPOT_TIMEOUT_MINUTES: "40320" })).toMatchObject({ action: "timeout", timeoutMinutes: 40320 });
    expect(loadHoneypotConfig({ ...env, HONEYPOT_ACTION: "log" })?.action).toBe("log");
  });
  it("requires valid guild and both distinct channel IDs", () => {
    for (const key of Object.keys(env)) expect(() => loadHoneypotConfig({ ...env, [key]: "invalid" })).toThrow("valid Discord ID");
    expect(() => loadHoneypotConfig({ HONEYPOT_CHANNEL_ID: env.HONEYPOT_CHANNEL_ID })).toThrow();
    expect(() => loadHoneypotConfig({ HONEYPOT_LOG_CHANNEL_ID: env.HONEYPOT_LOG_CHANNEL_ID })).toThrow();
    expect(() => loadHoneypotConfig({ ...env, HONEYPOT_LOG_CHANNEL_ID: env.HONEYPOT_CHANNEL_ID })).toThrow("different");
  });
  it("rejects unknown actions and invalid timeout durations", () => {
    expect(() => loadHoneypotConfig({ ...env, HONEYPOT_ACTION: "kick" })).toThrow("HONEYPOT_ACTION");
    for (const value of ["0", "40321", "1.5", "NaN"]) expect(() => loadHoneypotConfig({ ...env, HONEYPOT_TIMEOUT_MINUTES: value })).toThrow("HONEYPOT_TIMEOUT_MINUTES");
  });
});
