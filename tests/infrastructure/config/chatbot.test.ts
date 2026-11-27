import { describe, expect, it } from "vitest";
import { loadChatbotConfig } from "../../../src/infrastructure/config/chatbot";

describe("chatbot config", () => {
  it("is on and staff-only by default", () => {
    expect(loadChatbotConfig({})).toEqual({ access: "staff", roleIds: [], channelIds: [], cooldownSeconds: 3 });
  });

  it("can be turned off or opened up", () => {
    expect(loadChatbotConfig({ CHATBOT_ENABLED: "false" })).toBeUndefined();
    expect(loadChatbotConfig({ CHATBOT_ACCESS: "everyone" })?.access).toBe("everyone");
    expect(loadChatbotConfig({ CHATBOT_ACCESS: "roles", CHATBOT_ROLE_IDS: "123456789012345678, 123456789012345679" })?.roleIds).toEqual(["123456789012345678", "123456789012345679"]);
  });

  it("rejects bad values clearly", () => {
    expect(() => loadChatbotConfig({ CHATBOT_ACCESS: "admins" })).toThrow("CHATBOT_ACCESS");
    expect(() => loadChatbotConfig({ CHATBOT_ACCESS: "roles" })).toThrow("CHATBOT_ROLE_IDS");
    expect(() => loadChatbotConfig({ CHATBOT_CHANNEL_IDS: "general" })).toThrow("CHATBOT_CHANNEL_IDS");
    expect(() => loadChatbotConfig({ CHATBOT_COOLDOWN_SECONDS: "-1" })).toThrow("CHATBOT_COOLDOWN_SECONDS");
    expect(() => loadChatbotConfig({ CHATBOT_ENABLED: "yes" })).toThrow("CHATBOT_ENABLED");
  });
});
