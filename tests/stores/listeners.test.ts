import { describe, expect, it } from "vitest";

import { getStoreSnapshot } from "../helpers/storeSnapshot";

describe("Sapphire listener store", () => {
  it("discovers every Arrakis client and framework listener", async () => {
    const { listeners } = await getStoreSnapshot();
    expect(listeners).toEqual(
      expect.arrayContaining([
        "guildMemberAdd",
        "guildCreate",
        "guildMemberRemove",
        "levelingMessages",
        "suggestionMessages",
        "chatbotMessages",
        "chatbotMessageDelete",
        "chatbotMessageBulkDelete",
        "suggestionThreadCreate",
        "suggestionThreadUpdate",
        "suggestionThreadDelete",
        "honeypotMessages",
        "voiceStateUpdate",
        "musicRequest",
        "interactionCreate",
        "messageArchiveCreate",
        "messageArchiveUpdate",
        "messageArchiveDelete",
        "messageArchiveBulkDelete",
        "ready",
        "entryPointGuard",
        "commandDenied",
        "ClientError",
        "ClientWarn",
        "Invalidated",
        "ShardDisconnect",
        "ShardError",
        "ShardReady",
        "ShardReconnecting",
        "ShardResume",
        "AutocompleteError",
        "ChatInputCommandError",
        "InteractionHandlerError",
        "InteractionHandlerParseError",
        "ListenerError",
      ]),
    );
  });
});
