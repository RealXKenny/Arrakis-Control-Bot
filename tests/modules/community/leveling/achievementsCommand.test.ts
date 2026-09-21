import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { data, execute } from "../../../../src/commands/community/leveling/achievements";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../../src/shared/discord/discordLimits";

const profile = { guildId: "guild", userId: "member", xp: 6_250, messageCount: 120, voiceMinutes: 60, lastAwardedAt: null, rank: 3 };

function interaction(target?: { id: string; username: string; globalName: string | null }) {
  const achievements = vi.fn().mockResolvedValue({ profile, unlockedIds: ["message-king-of-spam-bronze", "voice-sietch-bronze", "level-kwisatz-bronze"] });
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const value = {
    guildId: "guild",
    guild: { members: { fetch: vi.fn().mockResolvedValue(null) } },
    user: { id: "member", username: "Traveler", globalName: "Desert Traveler" },
    client: { leveling: { achievements } },
    options: { getUser: vi.fn().mockReturnValue(target ?? null) },
    deferReply,
    editReply,
  } as unknown as ChatInputCommandInteraction;
  return { value, achievements, deferReply, editReply };
}

describe("achievements command", () => {
  it("registers a public command with an optional member", () => {
    expect(data.toJSON()).toMatchObject({ name: "achievements", options: [{ name: "member", required: false }] });
  });

  it("shows recorded unlocks and progress within Components V2 limits", async () => {
    const { value, achievements, deferReply, editReply } = interaction();
    await execute(value);
    expect(deferReply).toHaveBeenCalledWith();
    expect(achievements).toHaveBeenCalledWith("guild", "member");
    const payload = editReply.mock.calls[0]?.[0];
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.allowedMentions).toEqual({ parse: [] });
    const card = payload.components[0].toJSON();
    expect(JSON.stringify(card)).toContain("3 of 9 unlocked");
    expect(JSON.stringify(card)).toContain("120 / 500 rewarded messages");
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(countComponents(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
  });

  it("supports another member and escapes their display name", async () => {
    const { value, achievements, editReply } = interaction({ id: "other", username: "Other", globalName: "*Other*" });
    await execute(value);
    expect(achievements).toHaveBeenCalledWith("guild", "other");
    expect(JSON.stringify(editReply.mock.calls[0]?.[0].components[0].toJSON())).toContain("\\\\*Other\\\\*");
  });

  it("reports unavailable leveling without loading achievements", async () => {
    const { value, achievements, editReply } = interaction();
    Object.assign(value.client, { leveling: undefined });
    await execute(value);
    expect(achievements).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("not available") }));
  });
});
