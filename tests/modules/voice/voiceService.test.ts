import { Collection, ChannelType, PermissionFlagsBits, type Client, type Guild, type VoiceState } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceService } from "../../../src/modules/voice/VoiceService";
import type { VoiceRepository, VoiceRoom } from "../../../src/infrastructure/database/voice/VoiceRepository";
import { voicePanel } from "../../../src/modules/voice/voicePanel";
import { createVoiceCommand, voiceCommandDefinition } from "../../../src/support/commands/voiceCommandFactory";
import { VOICE_COMMANDS, type VoiceCommandAction } from "../../../src/modules/voice/voiceCommands";
const VoiceCommand = createVoiceCommand();

function fixture() {
  let saved: VoiceRoom | null = null;
  const repo = {
    initialize: vi.fn(),
    settings: vi.fn(() => Promise.resolve({ guild_id: "guild", join_channel_id: "hub", category_id: "category", panel_channel_id: "panel", panel_message_id: "message", enabled: true })),
    rooms: vi.fn(() => Promise.resolve(saved ? [saved] : [])),
    owned: vi.fn((_guild: string, owner: string) => Promise.resolve(saved?.owner_id === owner ? saved : null)),
    reserve: vi.fn((room: VoiceRoom) => { if (saved) return Promise.resolve(false); saved = { ...room }; return Promise.resolve(true); }),
    attach: vi.fn((_room: VoiceRoom, id: string) => { if (saved) saved.channel_id = id; return Promise.resolve(); }),
    remove: vi.fn(() => { saved = null; return Promise.resolve(); }),
    configure: vi.fn(), setPanel: vi.fn(), disable: vi.fn(),
  };
  const members = new Collection();
  const permissions = new Collection();
  const category = { id: "category", type: ChannelType.GuildCategory, permissionOverwrites: { cache: permissions } };
  const hub = { id: "hub", type: ChannelType.GuildVoice, members: new Collection<string, unknown>() };
  const room = {
    id: "room", type: ChannelType.GuildVoice, name: "Room", parentId: "category", members,
    permissionOverwrites: { cache: permissions, edit: vi.fn(), set: vi.fn() },
    setName: vi.fn(() => Promise.resolve(room)), setUserLimit: vi.fn(), edit: vi.fn(), delete: vi.fn(() => { channels.delete("room"); return Promise.resolve(); }),
    guild: { id: "guild" },
  };
  const channels = new Collection<string, unknown>([["category", category], ["hub", hub]]);
  const member = {
    id: "owner", displayName: "Owner", user: { bot: false }, guild: {} as unknown,
    voice: { channelId: "hub" as string | null, setChannel: vi.fn(() => { member.voice.channelId = "room"; members.set("owner", member); hub.members.delete("owner"); return Promise.resolve(); }) },
  };
  const other = { id: "other", voice: { channelId: "room", disconnect: vi.fn() } };
  hub.members.set("owner", member);
  const guild = {
    id: "guild", available: true,
    channels: {
      fetch: vi.fn((id?: string) => Promise.resolve(id ? channels.get(id) ?? null : channels)),
      create: vi.fn((options: { name: string }) => { room.name = options.name; channels.set("room", room); return Promise.resolve(room); }),
    },
    members: { fetch: vi.fn((id: string) => Promise.resolve(id === "owner" ? member : other)) },
  };
  member.guild = guild;
  const client = { user: { id: "bot" }, guilds: { cache: new Collection([["guild", guild]]) }, logger: { error: vi.fn() } };
  const service = new VoiceService(client as unknown as Client, repo as unknown as VoiceRepository);
  const join = () => service.onVoiceState({ channelId: null } as VoiceState, { channelId: "hub", guild, member } as unknown as VoiceState);
  const seed = (channelId: string | null = "room") => {
    saved = { guild_id: "guild", owner_id: "owner", channel_id: channelId, category_id: "category", creation_key: "jtc-recovery", role_permissions: [] };
    room.name = "jtc-recovery";
    channels.set("room", room);
    return saved;
  };
  return { service, repo, guild: guild as unknown as Guild, rawGuild: guild, client, room, member, other, channels, members, hub, join, seed, saved: () => saved };
}

afterEach(() => vi.useRealTimers());

describe("temporary voice rooms", () => {
  it("reserves in PostgreSQL before creating, records the ID, then moves the owner", async () => {
    const f = fixture();
    await Promise.all([f.join(), f.join()]);
    expect(f.repo.reserve).toHaveBeenCalledTimes(1);
    expect(f.rawGuild.channels.create).toHaveBeenCalledTimes(1);
    expect(f.repo.reserve.mock.invocationCallOrder[0]).toBeLessThan(f.rawGuild.channels.create.mock.invocationCallOrder[0]);
    expect(f.repo.attach.mock.invocationCallOrder[0]).toBeLessThan(f.member.voice.setChannel.mock.invocationCallOrder[0]);
    expect(f.room.setName).toHaveBeenCalledWith("🔊・Owner's Room");
    expect(f.saved()?.owner_id).toBe("owner");
    expect(f.saved()?.channel_id).toBe("room");
  });

  it("never creates a Discord channel when the database reservation fails", async () => {
    const f = fixture();
    f.repo.reserve.mockRejectedValueOnce(new Error("database offline"));
    await expect(f.join()).rejects.toThrow("database offline");
    expect(f.rawGuild.channels.create).not.toHaveBeenCalled();
  });

  it("rejects non-owners, owners outside their room, wrong panels and stale modals", async () => {
    const f = fixture(); f.seed();
    f.member.voice.channelId = "room";
    await expect(f.service.control(f.guild, "other", "lock")).rejects.toThrow("created and own");
    await expect(f.service.control(f.guild, "owner", "rename", "Name", "wrong")).rejects.toThrow("current voice control panel");
    await expect(f.service.control(f.guild, "owner", "rename", "Name", "panel", "different")).rejects.toThrow("stay inside");
    await expect(f.service.control(f.guild, "owner", "lock", undefined, "panel", undefined, "old-panel")).rejects.toThrow("current voice control panel");
    f.member.voice.channelId = "elsewhere";
    await expect(f.service.control(f.guild, "owner", "lock")).rejects.toThrow("stay inside");
    expect(f.room.permissionOverwrites.set).not.toHaveBeenCalled();
  });

  it("validates room names and user limits before Discord mutations", async () => {
    const f = fixture(); f.seed(); f.member.voice.channelId = "room";
    await expect(f.service.control(f.guild, "owner", "rename", "  ")).rejects.toThrow("room name");
    for (const limit of ["100", "-1", "1.5", "no"]) await expect(f.service.control(f.guild, "owner", "limit", limit)).rejects.toThrow("whole number");
    await f.service.control(f.guild, "owner", "limit", "0");
    expect(f.room.setUserLimit).toHaveBeenCalledWith(0, expect.any(String));
  });

  it("locks role overrides and restores the original role permissions on unlock", async () => {
    const f = fixture(); const saved = f.seed(); f.member.voice.channelId = "room";
    const connect = PermissionFlagsBits.Connect;
    saved.role_permissions = [{ id: "role", type: 0, allow: connect.toString(), deny: "0" }];
    f.room.permissionOverwrites.cache.set("role", { id: "role", type: 0, allow: { bitfield: connect }, deny: { bitfield: 0n } });
    await f.service.control(f.guild, "owner", "lock");
    expect(f.room.permissionOverwrites.set.mock.calls[0][0]).toContainEqual({ id: "role", type: 0, allow: 0n, deny: connect });
    await f.service.control(f.guild, "owner", "unlock");
    expect(f.room.permissionOverwrites.set.mock.calls[1][0]).toContainEqual({ id: "role", type: 0, allow: connect, deny: 0n });
  });

  it("never kicks members outside the owner's room or targets the owner", async () => {
    const f = fixture(); f.seed(); f.member.voice.channelId = "room";
    await expect(f.service.control(f.guild, "owner", "reject", "owner")).rejects.toThrow("another member");
    f.other.voice.channelId = "elsewhere";
    await expect(f.service.control(f.guild, "owner", "kick", "other")).rejects.toThrow("not in your room");
    expect(f.other.voice.disconnect).not.toHaveBeenCalled();
  });

  it("keeps occupied rooms and ownership across a restart", async () => {
    const f = fixture(); f.seed(); f.member.voice.channelId = "room"; f.hub.members.clear(); f.members.set("owner", f.member);
    await f.service.start();
    expect(f.room.delete).not.toHaveBeenCalled();
    expect(f.saved()?.owner_id).toBe("owner");
    await f.service.stop();
  });

  it("adopts an interrupted creation by its persisted marker without duplicating it", async () => {
    const f = fixture(); f.seed(null); f.member.voice.channelId = "room"; f.hub.members.clear(); f.members.set("owner", f.member);
    await f.service.start();
    expect(f.repo.attach).toHaveBeenCalledWith(expect.objectContaining({ creation_key: "jtc-recovery" }), "room");
    expect(f.rawGuild.channels.create).not.toHaveBeenCalled();
    expect(f.saved()?.channel_id).toBe("room");
    await f.service.stop();
  });

  it("recovers a room after saving its channel ID initially failed", async () => {
    const f = fixture();
    f.repo.attach.mockRejectedValueOnce(new Error("connection lost"));
    await expect(f.join()).rejects.toThrow("connection lost");
    expect(f.saved()?.channel_id).toBeNull();
    expect(f.member.voice.setChannel).not.toHaveBeenCalled();
    await f.join();
    expect(f.rawGuild.channels.create).toHaveBeenCalledTimes(1);
    expect(f.saved()?.channel_id).toBe("room");
  });

  it("deletes empty rooms before deleting their records and retains records on Discord failure", async () => {
    const f = fixture(); f.seed(); f.hub.members.clear(); f.member.voice.channelId = null;
    f.room.delete.mockRejectedValueOnce(new Error("permission denied"));
    await f.service.start();
    expect(f.repo.remove).not.toHaveBeenCalled();
    expect(f.saved()).not.toBeNull();
    await f.service.stop();
    await f.service.start();
    expect(f.saved()).toBeNull();
    await f.service.stop();
  });

  it("removes missing channel records but keeps records when Discord is unavailable", async () => {
    const f = fixture(); f.seed(); f.hub.members.clear(); f.member.voice.channelId = null;
    f.rawGuild.channels.fetch.mockRejectedValueOnce(new Error("network error"));
    await f.service.start();
    expect(f.saved()).not.toBeNull();
    await f.service.stop();
    f.channels.delete("room");
    await f.service.start();
    expect(f.saved()).toBeNull();
    await f.service.stop();
  });

  it("disabling creation preserves existing owner controls", async () => {
    const f = fixture();
    const settings = await f.repo.settings();
    f.repo.settings.mockResolvedValue({ ...settings, enabled: false });
    await f.join();
    expect(f.rawGuild.channels.create).not.toHaveBeenCalled();
    f.seed(); f.member.voice.channelId = "room";
    await f.service.control(f.guild, "owner", "rename", "Still mine");
    expect(f.room.setName).toHaveBeenCalledWith("Still mine", expect.any(String));
  });

  it("does not delete a room when the owner leaves other members inside", async () => {
    const f = fixture(); f.seed(); f.members.set("other", f.other); f.member.voice.channelId = null;
    await f.service.onVoiceState({ channelId: "room" } as VoiceState, { channelId: null, guild: f.guild, member: f.member } as unknown as VoiceState);
    expect(f.room.delete).not.toHaveBeenCalled();
    expect(f.saved()?.owner_id).toBe("owner");
  });

  it("requires Manage Server for setup even when the command is visible to everyone", async () => {
    const setup = vi.fn();
    const editReply = vi.fn();
    await VoiceCommand.prototype.chatInputRun.call({} as InstanceType<typeof VoiceCommand>, {
      guild: {}, client: { voiceRooms: { setup } },
      deferReply: vi.fn(), deferred: true, editReply,
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "setup" },
    } as never);
    expect(setup).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith({ content: expect.stringContaining("Manage Server") });
  });

  it("publishes a public panel without granting member control permissions", async () => {
    const f = fixture();
    const set = vi.fn();
    const edit = vi.fn();
    const denied = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;
    const panel = {
      type: ChannelType.GuildText,
      permissionOverwrites: {
        cache: new Collection([["role", { id: "role", type: 0, allow: { bitfield: 0n }, deny: { bitfield: denied } }]]),
        set,
      },
      messages: { fetch: vi.fn().mockResolvedValue({ edit }) },
    };
    f.channels.set("panel", panel);
    await f.service.panel(f.guild);
    const overwrites = set.mock.calls[0][0];
    expect(overwrites).toContainEqual({ id: "role", type: 0, allow: 0n, deny: PermissionFlagsBits.SendMessages });
    expect(overwrites).toContainEqual({ id: "guild", type: 0, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory, deny: 0n });
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("refreshes panels for every configured cached guild", async () => {
    const f = fixture();
    const panel = vi.spyOn(f.service, "panel").mockResolvedValue(undefined);
    await f.service.panels();
    expect(f.repo.settings).toHaveBeenCalledWith("guild");
    expect(panel).toHaveBeenCalledWith(f.guild);
  });

  it("resets defaults while preserving individual member access", async () => {
    const f = fixture(); const saved = f.seed(); f.member.voice.channelId = "room";
    const access = PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;
    saved.role_permissions = [{ id: "guild", type: 0, allow: access.toString(), deny: "0" }];
    f.room.permissionOverwrites.cache.set("guild", { id: "guild", type: 0, allow: { bitfield: 0n }, deny: { bitfield: access } });
    f.room.permissionOverwrites.cache.set("other", { id: "other", type: 1, allow: { bitfield: 0n }, deny: { bitfield: access } });
    await f.service.control(f.guild, "owner", "reset");
    expect(f.room.edit).toHaveBeenCalledWith({
      name: "🔊・Owner's Room", userLimit: 0,
      reason: expect.any(String),
      permissionOverwrites: [
        { id: "guild", type: 0, allow: access, deny: 0n },
        { id: "other", type: 1, allow: 0n, deny: access },
      ],
    });
    f.member.voice.channelId = "elsewhere";
    await expect(f.service.control(f.guild, "owner", "reset")).rejects.toThrow("stay inside");
    expect(f.room.edit).toHaveBeenCalledTimes(1);
  });

  it("ships a valid panel and discoverable setup and owner commands", () => {
    const panel = voicePanel();
    const children = panel.components[0].toJSON().components;
    expect(children.filter((child) => child.type === 1).flatMap((row) => row.components)).toHaveLength(12);
    const definitions = (Object.keys(VOICE_COMMANDS) as VoiceCommandAction[]).map((action) => voiceCommandDefinition(action).toJSON());
    expect(definitions).toHaveLength(13);
    expect(definitions.every((definition) => definition.type === 1 && !definition.options?.some((option) => Number(option.type) === 1 || Number(option.type) === 2))).toBe(true);
  });
});
