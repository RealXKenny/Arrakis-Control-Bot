import { Collection, type Client, type MessageCreateOptions } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { ensureServerInfoPanel } from "../../../../src/modules/server/information/serverInfoPanel";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../../src/shared/discord/discordLimits";

function setup(existingMessages = new Collection()) {
  const send = vi.fn().mockResolvedValue({});
  const channel = {
    isSendable: () => true,
    messages: { fetch: vi.fn().mockResolvedValue(existingMessages) },
    send,
  };
  const client = {
    user: { id: "bot" },
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  } as unknown as Client;

  return { client, send };
}

describe("server information panel", () => {
  it("publishes the complete configuration as two messages within Discord limits", async () => {
    const { client, send } = setup();

    await ensureServerInfoPanel(client, "server-info");

    expect(send).toHaveBeenCalledTimes(2);

    const messages = send.mock.calls.map(([payload]) => payload as MessageCreateOptions);
    const componentJson = messages.map(({ components }) => JSON.parse(JSON.stringify(components)) as unknown);

    for (const components of componentJson) {
      expect(countDisplayableText(components)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
      expect(countComponents(components)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
    }

    const combined = JSON.stringify(componentJson);
    expect(combined).toContain("m_BaseBackupToolMapRestriction");
    expect(combined).toContain("DuneSandbox.LandsraadSettings");
    expect(combined).toContain("m_bCrossMapRespawnDropItems=False");
  });
});
