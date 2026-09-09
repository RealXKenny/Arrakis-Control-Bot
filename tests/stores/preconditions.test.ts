import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { respondToCommandDenial } from "../../src/listeners/framework/commandDenied";
import { getStoreSnapshot } from "../helpers/storeSnapshot";

describe("Sapphire precondition store", () => {
  it("discovers all custom preconditions", async () => {
    const { preconditions } = await getStoreSnapshot();
    expect(preconditions).toEqual(expect.arrayContaining(["OwnerRoleOnly", "StaffOnly", "InteractionRateLimit"]));
  });

  it("returns generic precondition denials ephemerally", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    await respondToCommandDenial({ identifier: "InteractionRateLimit", message: "Please wait a moment before trying that again." } as never, { deferred: false, replied: false, reply } as never);
    expect(reply).toHaveBeenCalledWith({ content: "Please wait a moment before trying that again.", flags: MessageFlags.Ephemeral });
  });
});
