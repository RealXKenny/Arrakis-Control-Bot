import { describe, expect, it } from "vitest";

import { getStoreSnapshot } from "../helpers/storeSnapshot";

describe("Sapphire listener store", () => {
  it("discovers every Arrakis client and framework listener", async () => {
    const { listeners } = await getStoreSnapshot();
    expect(listeners).toEqual(
      expect.arrayContaining([
        "guildMemberAdd",
        "guildMemberRemove",
        "interactionCreate",
        "ready",
        "commandDenied",
        "ClientError",
        "ClientWarn",
        "Invalidated",
        "ShardDisconnect",
        "ShardError",
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
