import { ComponentType, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { data, execute } from "../../../../src/commands/community/leveling/level";
import type { LevelProfile } from "../../../../src/infrastructure/database/leveling/LevelRepository";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../../src/shared/discord/discordLimits";

describe("level command", () => {
  it("registers rank, leaderboard, event, and role controls", () => {
    const names = data.toJSON().options?.map((option) => option.name);
    expect(names).toEqual(["rank", "leaderboard", "event", "roles"]);
  });

  it("publishes a public rank card within Components V2 limits", async () => {
    const interaction = createInteraction("rank", {
      profile: vi.fn().mockResolvedValue(profile("member", 105, 2)),
      leaderboard: vi.fn(),
    });

    await execute(interaction.value);

    expect(interaction.deferReply).toHaveBeenCalledWith();
    const payload = interaction.editReply.mock.calls[0]?.[0];
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.files).toHaveLength(1);
    const card = payload.components[0].toJSON();
    expect(card.components).toHaveLength(1);
    expect(card.components[0]?.type).toBe(ComponentType.MediaGallery);
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(countComponents(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
  });

  it("renders no more than ten leaderboard rows without mentions", async () => {
    const profiles = Array.from({ length: 10 }, (_, index) => profile(String(1_000 + index), 1_000 - index, index + 1));
    const leaderboard = vi.fn().mockResolvedValue(profiles);
    const interaction = createInteraction("leaderboard", { profile: vi.fn(), leaderboard });

    await execute(interaction.value);

    expect(leaderboard).toHaveBeenCalledWith("guild");
    const payload = interaction.editReply.mock.calls[0]?.[0];
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(payload.files).toHaveLength(1);
    const card = payload.components[0].toJSON();
    expect(card.components).toHaveLength(1);
    expect(card.components[0]?.type).toBe(ComponentType.MediaGallery);
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  });

  it("keeps event and role administration private and permission checked", async () => {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      guildId: "guild",
      guild: {},
      client: { leveling: {} },
      user: { id: "member" },
      memberPermissions: { has: () => false },
      options: { getSubcommandGroup: () => "roles", getSubcommand: () => "status" },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(editReply).toHaveBeenCalledWith(expect.stringContaining("Manage Server"));
  });
});

function profile(userId: string, xp: number, rank: number): LevelProfile {
  return { guildId: "guild", userId, xp, messageCount: 7, voiceMinutes: 3, lastAwardedAt: new Date(), rank };
}

function createInteraction(action: "rank" | "leaderboard", leveling: { profile: ReturnType<typeof vi.fn>; leaderboard: ReturnType<typeof vi.fn> }) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  return {
    deferReply,
    editReply,
    value: {
      guildId: "guild",
      user: { id: "member", tag: "Member", username: "Member", globalName: "Desert Traveler", displayAvatarURL: () => "invalid-avatar" },
      client: {
        leveling: { ...leveling, multiplier: vi.fn().mockResolvedValue(1) },
        users: { cache: new Map(), fetch: vi.fn().mockResolvedValue(null) },
      },
      guild: { members: { cache: new Map(), fetch: vi.fn().mockResolvedValue(null) } },
      options: {
        getSubcommandGroup: () => null,
        getSubcommand: () => action,
        getUser: () => null,
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction,
  };
}
