import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@sapphire/framework", () => ({ container: { logger } }));

import { INTERACTION_ERROR_MESSAGE, describeInteraction, formatError, respondWithInteractionError } from "../../../src/support/interactions/interactionResponses";

describe("interaction responses", () => {
  beforeEach(() => logger.error.mockReset());

  it("formats structured HTTP errors without allowing unbounded detail output", () => {
    const error = Object.assign(new Error("Conflict"), { name: "ConsoleError", status: 409, details: { reason: "x".repeat(1_100) } });
    const result = formatError(error);
    expect(result).toContain("ConsoleError HTTP 409: Conflict | details=");
    expect(result.length).toBeLessThan(1_100);
    expect(formatError("offline")).toBe("offline");
  });

  it("describes command, autocomplete, component, and unknown interactions", () => {
    expect(describeInteraction({ isChatInputCommand: () => true, commandName: "help" } as never)).toBe("/help");
    expect(describeInteraction({ isChatInputCommand: () => false, isAutocomplete: () => true, commandName: "market" } as never)).toBe("/market autocomplete");
    expect(describeInteraction({ isChatInputCommand: () => false, isAutocomplete: () => false, isButton: () => true, customId: "ticket:open" } as never)).toBe("ticket:open");
    expect(describeInteraction({ isChatInputCommand: () => false, isAutocomplete: () => false, isButton: () => false, isAnySelectMenu: () => false, isModalSubmit: () => false } as never)).toBe("unknown");
  });

  it.each([
    [{ deferred: true, replied: false }, "editReply"],
    [{ deferred: false, replied: true }, "followUp"],
    [{ deferred: false, replied: false }, "reply"],
  ])("uses the correct acknowledgement path %#", async (state, expectedMethod) => {
    const interaction = {
      isAutocomplete: () => false,
      editReply: vi.fn(), followUp: vi.fn(), reply: vi.fn(),
      ...state,
    };
    await respondWithInteractionError(interaction as never);
    expect(interaction[expectedMethod as keyof typeof interaction]).toHaveBeenCalledWith(expect.objectContaining({ content: INTERACTION_ERROR_MESSAGE }));
  });

  it("returns an empty autocomplete result and logs response failures", async () => {
    const failure = new Error("closed");
    const interaction = { isAutocomplete: () => true, respond: vi.fn().mockRejectedValue(failure) };
    await respondWithInteractionError(interaction as never);
    expect(interaction.respond).toHaveBeenCalledWith([]);
    expect(logger.error).toHaveBeenCalledWith("Unable to send autocomplete fallback.", failure);
  });
});
