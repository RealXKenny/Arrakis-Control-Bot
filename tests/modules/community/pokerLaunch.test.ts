import { MessageFlags, RESTJSONErrorCodes, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sapphire/framework", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sapphire/framework")>()),
  container: { logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));

import { data } from "../../../src/commands/community/poker/poker";
import { UNAVAILABLE_TITLE, launchPokerActivity } from "../../../src/modules/community/poker/pokerLaunch";

function interaction(launch: () => Promise<unknown>, state: { replied?: boolean; deferred?: boolean } = {}) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const launchActivity = vi.fn(launch);
  return {
    value: { launchActivity, reply, replied: state.replied ?? false, deferred: state.deferred ?? false } as unknown as ChatInputCommandInteraction,
    reply,
    launchActivity,
  };
}

describe("/poker", () => {
  it("is a guild-only slash command", () => {
    const json = data.toJSON();
    expect(json.name).toBe("poker");
    expect(json.contexts).toEqual([0]);
    expect(json.options ?? []).toHaveLength(0);
  });

  it("acknowledges the interaction only by launching the Activity", async () => {
    const fake = interaction(() => Promise.resolve(undefined));
    await launchPokerActivity(fake.value);
    expect(fake.launchActivity).toHaveBeenCalledOnce();
    expect(fake.reply).not.toHaveBeenCalled();
  });

  it("replies privately with a safe message when Discord refuses the launch", async () => {
    const fake = interaction(() => Promise.reject(Object.assign(new Error("Activities are not enabled"), { code: 50_234 })));
    await launchPokerActivity(fake.value);
    expect(fake.reply).toHaveBeenCalledOnce();
    const payload = fake.reply.mock.calls[0]?.[0] as { flags: number; allowedMentions: unknown; components: unknown[] };
    expect(payload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    expect(payload.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(JSON.stringify(payload.components)).toContain(UNAVAILABLE_TITLE);
    expect(JSON.stringify(payload.components)).not.toContain("Activities are not enabled");
  });

  it("does not answer twice or answer an expired interaction", async () => {
    const expired = interaction(() => Promise.reject(Object.assign(new Error("Unknown interaction"), { code: RESTJSONErrorCodes.UnknownInteraction })));
    await launchPokerActivity(expired.value);
    expect(expired.reply).not.toHaveBeenCalled();

    const acknowledged = interaction(() => Promise.reject(new Error("late failure")), { replied: true });
    await launchPokerActivity(acknowledged.value);
    expect(acknowledged.reply).not.toHaveBeenCalled();
  });
});
