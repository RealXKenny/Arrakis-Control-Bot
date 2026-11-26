import { describe, expect, it } from "vitest";
import { loadSuggestionConfig } from "../../../src/infrastructure/config/suggestions";

const env = { GUILD_ID: "123456789012345678", SUGGESTIONS_FORUM_CHANNEL_ID: "223456789012345678" };

describe("suggestion assistant configuration", () => {
  it("stays disabled without a forum channel", () => {
    expect(loadSuggestionConfig({})).toBeUndefined();
    expect(loadSuggestionConfig({ SUGGESTIONS_FORUM_CHANNEL_ID: "  " })).toBeUndefined();
  });

  it("uses sensible defaults", () => {
    expect(loadSuggestionConfig(env)).toEqual({
      guildId: env.GUILD_ID, forumChannelId: env.SUGGESTIONS_FORUM_CHANNEL_ID, autoTag: true, panel: true, notifyAuthor: true, createMissingTags: true,
      duplicateThreshold: 0.35, autoSummaryMessages: 50, backfillLimit: 500,
    });
  });

  it("reads overrides", () => {
    expect(loadSuggestionConfig({
      ...env, SUGGESTIONS_AUTO_TAG: "false", SUGGESTIONS_STATUS_PANEL: "FALSE", SUGGESTIONS_NOTIFY_AUTHOR: "false", SUGGESTIONS_CREATE_TAGS: "false",
      SUGGESTIONS_DUPLICATE_THRESHOLD: "0.5", SUGGESTIONS_AUTO_SUMMARY_MESSAGES: "0", SUGGESTIONS_BACKFILL_LIMIT: "0",
    })).toMatchObject({ autoTag: false, panel: false, notifyAuthor: false, createMissingTags: false, duplicateThreshold: 0.5, autoSummaryMessages: 0, backfillLimit: 0 });
  });

  it("rejects invalid IDs and values", () => {
    expect(() => loadSuggestionConfig({ ...env, GUILD_ID: "x" })).toThrow("GUILD_ID");
    expect(() => loadSuggestionConfig({ ...env, SUGGESTIONS_FORUM_CHANNEL_ID: "forum" })).toThrow("SUGGESTIONS_FORUM_CHANNEL_ID");
    expect(() => loadSuggestionConfig({ ...env, SUGGESTIONS_AUTO_TAG: "yes" })).toThrow("SUGGESTIONS_AUTO_TAG");
    for (const value of ["0.05", "1", "NaN"]) expect(() => loadSuggestionConfig({ ...env, SUGGESTIONS_DUPLICATE_THRESHOLD: value })).toThrow("SUGGESTIONS_DUPLICATE_THRESHOLD");
    for (const value of ["-1", "2.5", "1001"]) expect(() => loadSuggestionConfig({ ...env, SUGGESTIONS_AUTO_SUMMARY_MESSAGES: value })).toThrow("SUGGESTIONS_AUTO_SUMMARY_MESSAGES");
    expect(() => loadSuggestionConfig({ ...env, SUGGESTIONS_BACKFILL_LIMIT: "5001" })).toThrow("SUGGESTIONS_BACKFILL_LIMIT");
  });
});
