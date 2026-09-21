import { Collection, MessageFlags, type Client, type Guild, type GuildMember, type Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { LevelProfile, LevelStorage } from "../../../../src/infrastructure/database/leveling/LevelRepository";
import { activityMultiplier, LevelingService } from "../../../../src/modules/community/leveling/LevelingService";
import { MESSAGE_REPEAT_WINDOW_MS, MESSAGE_XP_COOLDOWN_MS, VOICE_XP_COOLDOWN_MS, messageXp } from "../../../../src/modules/community/leveling/levelProgress";

describe("LevelingService", () => {
  it("awards eligible messages and announces a new level without pinging", async () => {
    const profile = createProfile(250);
    const storage = createStorage(profile);
    const reply = vi.fn().mockResolvedValue(undefined);
    const service = new LevelingService(createClient(), storage, { arrakisWanderer: "role" });

    const message = createMessage({ reply });
    await service.handleMessage(message);

    expect(storage.awardMessageXp).toHaveBeenCalledWith(
      "guild",
      "user",
      messageXp("The spice must flow."),
      MESSAGE_XP_COOLDOWN_MS,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      MESSAGE_REPEAT_WINDOW_MS,
    );
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      components: expect.any(Array),
      files: expect.any(Array),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false },
    }));
    expect(message.member!.roles.add).toHaveBeenCalledWith(expect.objectContaining({ name: "Arrakis Wanderer" }), "Reached community level 1");
  });

  it("does not announce ordinary awards or count bots and tiny messages", async () => {
    const storage = createStorage(createProfile(30));
    const reply = vi.fn().mockResolvedValue(undefined);
    const service = new LevelingService(createClient(), storage);

    await service.handleMessage(createMessage({ reply }));
    await service.handleMessage(createMessage({ reply, bot: true }));
    await service.handleMessage(createMessage({ reply, content: "hi" }));

    expect(storage.awardMessageXp).toHaveBeenCalledOnce();
    expect(reply).not.toHaveBeenCalled();
  });

  it("stacks booster and active-event bonuses multiplicatively", () => {
    const now = Date.now();
    const event = { guildId: "guild", startsAt: new Date(now - 1_000), endsAt: new Date(now + 60_000), createdBy: "admin" };
    expect(activityMultiplier({ premiumSince: null } as GuildMember, event, now)).toBe(2);
    expect(activityMultiplier({ premiumSince: new Date() } as GuildMember, event, now)).toBe(4);
    expect(activityMultiplier({ premiumSince: new Date() } as GuildMember, null, now)).toBe(2);
  });

  it("awards voice XP only in active human conversations", async () => {
    const storage = createStorage(createProfile(60));
    const activeEvent = { guildId: "guild", startsAt: new Date(Date.now() - 1_000), endsAt: new Date(Date.now() + 60_000), createdBy: "admin" };
    storage.upcomingEvent.mockResolvedValue(activeEvent);
    const first = createVoiceMember("first", true);
    const second = createVoiceMember("second", false);
    const guild = {
      id: "guild",
      afkChannelId: "afk",
      channels: { cache: new Map([["voice", { id: "voice", isVoiceBased: () => true, members: new Map([[first.id, first], [second.id, second]]) }]]) },
    };
    const service = new LevelingService({ guilds: { cache: new Map([["guild", guild]]) } } as unknown as Client, storage);

    await service.awardVoiceActivity();

    expect(storage.awardVoiceXp).toHaveBeenNthCalledWith(1, "guild", "first", 60, VOICE_XP_COOLDOWN_MS);
    expect(storage.awardVoiceXp).toHaveBeenNthCalledWith(2, "guild", "second", 30, VOICE_XP_COOLDOWN_MS);
  });

  it("reports role readiness from environment-configured IDs", () => {
    const guild = {
      roles: { cache: new Collection([["wanderer", { id: "wanderer", name: "Arrakis Wanderer", editable: true }]]) },
    } as unknown as Guild;
    const service = new LevelingService(createClient(), createStorage(null), { arrakisWanderer: "wanderer" });

    expect(service.roleStatus(guild)[0]).toMatchObject({ name: "Arrakis Wanderer", configured: true, present: true, manageable: true });
    expect(service.roleStatus(guild)[1]).toMatchObject({ name: "Sietch Dweller", configured: false, present: false });
  });
});

function createProfile(xp: number): LevelProfile {
  return { guildId: "guild", userId: "user", xp, messageCount: 1, voiceMinutes: 0, lastAwardedAt: new Date(), rank: null };
}

function createStorage(result: LevelProfile | null): LevelStorage & {
  awardMessageXp: ReturnType<typeof vi.fn>;
  awardVoiceXp: ReturnType<typeof vi.fn>;
  upcomingEvent: ReturnType<typeof vi.fn>;
} {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    awardMessageXp: vi.fn().mockResolvedValue(result),
    awardVoiceXp: vi.fn().mockResolvedValue(result),
    profile: vi.fn().mockResolvedValue(createProfile(0)),
    leaderboard: vi.fn().mockResolvedValue([]),
    scheduleEvent: vi.fn(),
    upcomingEvent: vi.fn().mockResolvedValue(null),
    stopEvent: vi.fn().mockResolvedValue(false),
  };
}

function createMessage(options: { reply: ReturnType<typeof vi.fn>; bot?: boolean; content?: string }): Message {
  const guild = { id: "guild", roles: { cache: new Collection([["role", { id: "role", name: "Arrakis Wanderer", editable: true }]]) } };
  return {
    guildId: "guild",
    guild,
    author: { id: "user", bot: options.bot ?? false, username: "Paul_Atreides", displayAvatarURL: () => "invalid-avatar" },
    member: { displayName: "Paul *Atreides*", guild, premiumSince: null, roles: { cache: new Map(), remove: vi.fn(), add: vi.fn() } },
    webhookId: null,
    system: false,
    content: options.content ?? "The spice must flow.",
    attachments: new Collection(),
    reference: null,
    reply: options.reply,
  } as unknown as Message;
}

function createClient(): Client {
  return { guilds: { cache: new Map() } } as unknown as Client;
}

function createVoiceMember(id: string, booster: boolean): GuildMember {
  const guild = { id: "guild", roles: { cache: new Collection() } };
  return {
    id,
    user: { bot: false },
    guild,
    premiumSince: booster ? new Date() : null,
    voice: { selfDeaf: false, serverDeaf: false, suppress: false },
    roles: { cache: new Map(), remove: vi.fn(), add: vi.fn() },
  } as unknown as GuildMember;
}
