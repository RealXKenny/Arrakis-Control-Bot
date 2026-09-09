import { MessageFlags, type ButtonInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { UNAVAILABLE_MESSAGE, respondWithUnavailableControl } from "../../src/interaction-handlers/fallbacks/unavailable";
import { respondWithRateLimit } from "../../src/support/RateLimitedInteractionHandler";
import { isKnownComponentInteraction, matchesCustomId } from "../../src/support/componentCustomIds";

describe("Sapphire interaction routing", () => {
  it("matches exact and ticket-prefixed custom IDs without accepting near misses", () => {
    expect(matchesCustomId("ticket-claim", "ticket-claim", "ticket-claim:")).toBe(true);
    expect(matchesCustomId("ticket-claim:42", "ticket-claim", "ticket-claim:")).toBe(true);
    expect(matchesCustomId("ticket-claiming:42", "ticket-claim", "ticket-claim:")).toBe(false);
    expect(isKnownComponentInteraction(fakeButton("ticket-review:42"))).toBe(true);
    expect(isKnownComponentInteraction(fakeButton("expired-control"))).toBe(false);
  });

  it("returns the exact stale-control fallback ephemerally", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    await respondWithUnavailableControl({ reply } as unknown as ButtonInteraction);
    expect(reply).toHaveBeenCalledWith({ content: UNAVAILABLE_MESSAGE, flags: MessageFlags.Ephemeral });
  });

  it("uses reply, edit, and follow-up paths for rate-limit responses", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    await respondWithRateLimit({ deferred: false, replied: false, reply } as unknown as ButtonInteraction);
    expect(reply).toHaveBeenCalledWith({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });

    const editReply = vi.fn().mockResolvedValue(undefined);
    await respondWithRateLimit({ deferred: true, replied: false, editReply } as unknown as ButtonInteraction);
    expect(editReply).toHaveBeenCalledWith({ content: "Please wait a moment before trying that again." });

    const followUp = vi.fn().mockResolvedValue(undefined);
    await respondWithRateLimit({ deferred: false, replied: true, followUp } as unknown as ButtonInteraction);
    expect(followUp).toHaveBeenCalledWith({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });
  });

});

function fakeButton(customId: string): ButtonInteraction {
  return {
    customId,
    isButton: () => true,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
  } as unknown as ButtonInteraction;
}
