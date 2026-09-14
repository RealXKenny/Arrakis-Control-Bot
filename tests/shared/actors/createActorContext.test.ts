import { describe, expect, it } from "vitest";
import { createActorContext } from "../../../src/shared/actors/createActorContext";

describe("createActorContext", () => {
  it("captures guild identity and role ids for audit records", () => {
    const interaction = { inGuild: () => true, guildId: "guild-1", channelId: "channel-1", user: { id: "user-1", username: "stilgar" }, member: { roles: { cache: new Map([["role-a", {}], ["role-b", {}]]) } }, id: "interaction-1" };
    expect(createActorContext(interaction as never, "restart-server")).toEqual({ guildId: "guild-1", channelId: "channel-1", userId: "user-1", username: "stilgar", roleIds: ["role-a", "role-b"], interactionId: "interaction-1", commandName: "restart-server" });
  });

  it("handles direct-message interactions without member roles", () => {
    const interaction = { inGuild: () => false, guildId: null, channelId: null, user: { id: "u", username: "user" }, member: null, id: "i" };
    expect(createActorContext(interaction as never, "help").roleIds).toEqual([]);
  });
});
