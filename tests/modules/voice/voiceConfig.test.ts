import { expect, it } from "vitest";
import { loadVoiceSetup } from "../../../src/infrastructure/config/voiceRooms";

const env = {
  VOICE_GUILD_ID: "123456789012345678",
  VOICE_JOIN_CHANNEL_ID: "223456789012345678",
  VOICE_CATEGORY_ID: "323456789012345678",
  VOICE_PANEL_CHANNEL_ID: "423456789012345678",
  DATABASE_URL: "postgresql://localhost/bot",
};

it("leaves saved setup authoritative when environment IDs are blank", () => {
  expect(loadVoiceSetup({})).toBeUndefined();
  expect(loadVoiceSetup({ VOICE_GUILD_ID: " " })).toBeUndefined();
});

it("requires a complete set of valid IDs and persistent storage", () => {
  expect(() => loadVoiceSetup({ ...env, VOICE_CATEGORY_ID: "" })).toThrow("VOICE_CATEGORY_ID");
  expect(() => loadVoiceSetup({ ...env, VOICE_GUILD_ID: "invalid" })).toThrow("VOICE_GUILD_ID");
  expect(() => loadVoiceSetup({ ...env, DATABASE_URL: "" })).toThrow("DATABASE_URL");
  expect(loadVoiceSetup(env)).toEqual({ guildId: env.VOICE_GUILD_ID, joinChannelId: env.VOICE_JOIN_CHANNEL_ID, categoryId: env.VOICE_CATEGORY_ID, panelChannelId: env.VOICE_PANEL_CHANNEL_ID });
});
