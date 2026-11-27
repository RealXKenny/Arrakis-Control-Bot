import { describe, expect, it } from "vitest";
import { AI_MODELS, loadChatbotConfig } from "../../../src/infrastructure/config/chatbot";

describe("chatbot config", () => {
  it("is on, open to everyone, learning and answering by default", () => {
    expect(loadChatbotConfig({})).toEqual({
      access: "everyone", roleIds: [], channelIds: [], cooldownSeconds: 3,
      learn: true, learnChannelIds: [], learnLimit: 5_000,
      autoReply: true, autoChannelIds: [], autoConfidence: 0.5, autoDelaySeconds: 15, autoCooldownSeconds: 60,
      web: true, webWikiUrl: "https://dune.fandom.com", webPerMinute: 20, webAuto: false,
    });
  });

  it("can be turned off or opened up", () => {
    expect(loadChatbotConfig({ CHATBOT_ENABLED: "false" })).toBeUndefined();
    expect(loadChatbotConfig({ CHATBOT_ACCESS: "staff" })?.access).toBe("staff");
    expect(loadChatbotConfig({ CHATBOT_ACCESS: "roles", CHATBOT_ROLE_IDS: "123456789012345678, 123456789012345679" })?.roleIds).toEqual(["123456789012345678", "123456789012345679"]);
  });

  it("rejects bad values clearly", () => {
    expect(() => loadChatbotConfig({ CHATBOT_ACCESS: "admins" })).toThrow("CHATBOT_ACCESS");
    expect(() => loadChatbotConfig({ CHATBOT_ACCESS: "roles" })).toThrow("CHATBOT_ROLE_IDS");
    expect(() => loadChatbotConfig({ CHATBOT_CHANNEL_IDS: "general" })).toThrow("CHATBOT_CHANNEL_IDS");
    expect(() => loadChatbotConfig({ CHATBOT_COOLDOWN_SECONDS: "-1" })).toThrow("CHATBOT_COOLDOWN_SECONDS");
    expect(() => loadChatbotConfig({ CHATBOT_ENABLED: "yes" })).toThrow("CHATBOT_ENABLED");
    expect(() => loadChatbotConfig({ CHATBOT_AUTO_CONFIDENCE: "0.05" })).toThrow("CHATBOT_AUTO_CONFIDENCE");
    expect(() => loadChatbotConfig({ CHATBOT_LEARN_LIMIT: "10" })).toThrow("CHATBOT_LEARN_LIMIT");
    expect(() => loadChatbotConfig({ CHATBOT_WEB_WIKI_URL: "http://10.0.0.5" })).toThrow("CHATBOT_WEB_WIKI_URL");
    expect(() => loadChatbotConfig({ CHATBOT_WEB_WIKI_URL: "https://user:pw@wiki.example" })).toThrow("CHATBOT_WEB_WIKI_URL");
    expect(loadChatbotConfig({ CHATBOT_WEB_WIKI_URL: "none" })?.webWikiUrl).toBeUndefined();
  });

  it("keeps its own AI model off until turned on, with checksummed presets", () => {
    expect(loadChatbotConfig({})?.ai).toBeUndefined();
    expect(loadChatbotConfig({ CHATBOT_AI: "true" })?.ai).toEqual({
      modelUri: AI_MODELS.small!.uri, sha256: AI_MODELS.small!.sha256, modelDir: "models",
      threads: 8, contextSize: 4_096, maxTokens: 220, timeoutSeconds: 60,
    });
    expect(loadChatbotConfig({ CHATBOT_AI: "true", CHATBOT_AI_MODEL: "large", CHATBOT_AI_THREADS: "12" })?.ai).toMatchObject({ modelUri: AI_MODELS.large!.uri, sha256: AI_MODELS.large!.sha256, threads: 12 });
    expect(loadChatbotConfig({ CHATBOT_AI: "true", CHATBOT_AI_MODEL: "hf:someone/repo/model-Q4_K_M.gguf" })?.ai).toMatchObject({ modelUri: "hf:someone/repo/model-Q4_K_M.gguf", sha256: undefined });
    expect(() => loadChatbotConfig({ CHATBOT_AI: "true", CHATBOT_AI_MODEL: "https://evil.example/model.gguf" })).toThrow("CHATBOT_AI_MODEL");
    expect(() => loadChatbotConfig({ CHATBOT_AI: "true", CHATBOT_AI_MODEL: "hf:a/../b/model.gguf" })).toThrow("CHATBOT_AI_MODEL");
    expect(() => loadChatbotConfig({ CHATBOT_AI: "true", CHATBOT_AI_MODEL_SHA256: "abc" })).toThrow("CHATBOT_AI_MODEL_SHA256");
  });
});
