import { randomUUID } from "node:crypto";
import { ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildMember, type VoiceChannel, type VoiceState } from "discord.js";
import { VoiceRepository, type VoiceRoom } from "../../infrastructure/database/voice/VoiceRepository";
import { voicePanel } from "./voicePanel";
import type { VoiceSetupConfig } from "../../infrastructure/config/voiceRooms";
import { scopedLogger, type Logger } from "../../client/logger";

export class VoiceUserError extends Error {}
export type VoiceAction = "rename" | "limit" | "lock" | "unlock" | "hide" | "show" | "permit" | "reject" | "kick" | "delete" | "reset";

export function defaultVoiceRoomName(displayName: string): string {
  return `🔊・${displayName.slice(0, 90)}'s Room`;
}

function missingChannel(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 10003;
}

export class VoiceService {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly createdAt = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private reconciling = false;
  private readonly logger: Logger;

  public constructor(
    private readonly client: Client,
    private readonly repository: VoiceRepository,
    private readonly panelPublic = true,
    private readonly setupConfig?: VoiceSetupConfig,
  ) {
    this.logger = scopedLogger(client.logger, "VOICE");
  }

  public async initialize(): Promise<void> { await this.repository.initialize(); }

  public async isManagedChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await this.repository.settings(guildId);
    return settings?.join_channel_id === channelId || (await this.repository.rooms(guildId)).some((room) => room.channel_id === channelId);
  }

  // Dev note: One guild, one queue; otherwise every room becomes a conference call.
  private async serial<T>(guildId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(guildId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    this.queues.set(guildId, current);
    try { return await current; }
    finally { if (this.queues.get(guildId) === current) this.queues.delete(guildId); }
  }

  public async start(): Promise<void> {
    if (this.timer) return;
    this.stopped = false;
    if (this.setupConfig) {
      const { guildId, joinChannelId, categoryId, panelChannelId } = this.setupConfig;
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) await this.setup(guild, joinChannelId, categoryId, panelChannelId);
    }
    await this.reconcile();
    if (!this.stopped) this.timer = setInterval(() => { void this.reconcile(); }, 60_000);
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
    await Promise.allSettled(this.queues.values());
  }

  public async onVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (this.stopped || oldState.channelId === newState.channelId) return;
    await this.serial(newState.guild.id, async () => {
      const rooms = await this.repository.rooms(newState.guild.id);
      const left = oldState.channelId ? rooms.find((room) => room.channel_id === oldState.channelId) : undefined;
      if (left) await this.removeIfEmpty(newState.guild, left);
      const settings = await this.repository.settings(newState.guild.id);
      if (settings?.enabled && newState.channelId === settings.join_channel_id && newState.member && !newState.member.user.bot) {
        await this.createRoom(newState.member, settings.join_channel_id, settings.category_id);
      }
    });
  }

  public async setup(guild: Guild, joinId: string, categoryId: string, panelId: string): Promise<void> {
    if (this.client.music?.config.voiceChannelId === joinId) throw new VoiceUserError("The music lounge cannot also be a Join to Create channel.");
    await this.serial(guild.id, async () => {
      const [join, category, panel, me] = await Promise.all([
        guild.channels.fetch(joinId), guild.channels.fetch(categoryId), guild.channels.fetch(panelId), guild.members.fetchMe(),
      ]);
      if (join?.type !== ChannelType.GuildVoice || category?.type !== ChannelType.GuildCategory || panel?.type !== ChannelType.GuildText) {
        throw new VoiceUserError("Choose a voice join channel, a category, and a text control-panel channel in this server.");
      }
      const managed = await this.repository.rooms(guild.id);
      if (managed.some((room) => room.channel_id === joinId)) throw new VoiceUserError("A temporary room cannot be the join channel.");
      if (!category.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect]) ||
          !join.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect]) ||
          !panel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory]) ||
          (this.panelPublic && !panel.permissionsFor(me)?.has(PermissionFlagsBits.ManageRoles))) {
        throw new VoiceUserError("The bot needs View Channel, Connect, Move Members, Manage Channels and Manage Roles in the voice category, access to the join channel, and Send Messages/Embed Links in the panel channel.");
      }
      await this.repository.configure(guild.id, joinId, categoryId, panelId);
      await this.publishPanel(guild);
    });
  }

  public async panel(guild: Guild): Promise<void> {
    await this.serial(guild.id, () => this.publishPanel(guild));
  }

  public async panels(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      if (await this.configured(guild.id)) await this.panel(guild);
    }
  }

  public async configured(guildId: string): Promise<boolean> {
    return Boolean(await this.repository.settings(guildId));
  }

  private async publishPanel(guild: Guild): Promise<void> {
    const settings = await this.repository.settings(guild.id);
    if (!settings) throw new VoiceUserError("Run /voice setup first.");
    const channel = await guild.channels.fetch(settings.panel_channel_id);
    if (channel?.type !== ChannelType.GuildText) throw new VoiceUserError("The configured control-panel channel is unavailable. Run /voice setup again.");
    if (this.panelPublic) {
      // Dev note: Open the curtains without rearranging the rest of the furniture.
      const publicBits = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
      const overwrites = channel.permissionOverwrites.cache.map((entry) => ({
        id: entry.id, type: entry.type, allow: entry.allow.bitfield, deny: entry.deny.bitfield & ~publicBits,
      }));
      const everyone = overwrites.find((entry) => entry.id === guild.id);
      if (everyone) everyone.allow |= publicBits;
      else overwrites.push({ id: guild.id, type: 0, allow: publicBits, deny: 0n });
      await channel.permissionOverwrites.set(overwrites, "Public voice control panel; actions remain owner-only");
    }
    if (settings.panel_message_id) {
      try {
        const message = await channel.messages.fetch(settings.panel_message_id);
        await message.edit({ ...voicePanel(settings.join_channel_id), content: null, embeds: [], attachments: [] });
        return;
      } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === 10008)) throw error;
      }
    }
    const message = await channel.send(voicePanel(settings.join_channel_id));
    await this.repository.setPanel(guild.id, message.id);
  }

  public async disable(guildId: string): Promise<void> {
    await this.serial(guildId, () => this.repository.disable(guildId));
  }

  public async authorize(guild: Guild, userId: string, panelChannelId?: string, expectedRoomId?: string, panelMessageId?: string) {
    const room = await this.repository.owned(guild.id, userId);
    if (!room?.channel_id) throw new VoiceUserError("You must be inside a voice room you created and own.");
    if (panelChannelId) {
      const settings = await this.repository.settings(guild.id);
      if (!settings || settings.panel_channel_id !== panelChannelId || (panelMessageId && settings.panel_message_id !== panelMessageId)) {
        throw new VoiceUserError("Use the current voice control panel in its configured channel.");
      }
    }
    const channel = await guild.channels.fetch(room.channel_id);
    const member = await guild.members.fetch(userId);
    if (channel?.type !== ChannelType.GuildVoice || member.voice.channelId !== room.channel_id || (expectedRoomId && expectedRoomId !== room.channel_id)) {
      throw new VoiceUserError("You must stay inside the voice room you created and own to use these controls.");
    }
    return { room, channel, member };
  }

  public async control(guild: Guild, userId: string, action: VoiceAction, value?: string, panelChannelId?: string, expectedRoomId?: string, panelMessageId?: string): Promise<void> {
    if (this.stopped) throw new VoiceUserError("Voice controls are shutting down. Try again shortly.");
    await this.serial(guild.id, async () => {
      const { room, channel, member } = await this.authorize(guild, userId, panelChannelId, expectedRoomId, panelMessageId);
      const reason = `Temporary voice room control by ${userId}`;
      switch (action) {
        case "reset":
          await channel.edit({
            name: defaultVoiceRoomName(member.displayName),
            userLimit: 0,
            permissionOverwrites: this.accessOverwrites(channel, room, "reset"),
            reason,
          });
          break;
        case "rename": {
          const name = value?.trim();
          if (!name || name.length > 100 || [...name].some((character) => character.charCodeAt(0) < 32)) throw new VoiceUserError("Enter a room name between 1 and 100 characters without line breaks.");
          await channel.setName(name, reason);
          break;
        }
        case "limit": {
          if (!value || !/^\d{1,2}$/.test(value)) throw new VoiceUserError("Enter a whole number from 0 to 99. Zero means unlimited.");
          await channel.setUserLimit(Number(value), reason);
          break;
        }
        case "lock": case "unlock": case "hide": case "show":
          await this.setAccess(channel, room, action, reason);
          break;
        case "permit": case "reject": case "kick": {
          if (!value || value === userId || value === this.client.user?.id) throw new VoiceUserError("Choose another member, not yourself or the bot.");
          const target = await guild.members.fetch(value);
          // Dev note: Member lookups take time, and room owners have feet.
          if (member.voice.channelId !== channel.id) throw new VoiceUserError("Stay inside your room to manage members.");
          if (action === "kick") {
            if (target.voice.channelId !== channel.id) throw new VoiceUserError("That member is not in your room.");
            await target.voice.disconnect(reason);
          } else {
            await channel.permissionOverwrites.edit(target.id, { ViewChannel: action === "permit", Connect: action === "permit" }, { reason });
            if (action === "reject" && target.voice.channelId === channel.id) await target.voice.disconnect(reason);
          }
          break;
        }
        case "delete":
          await channel.delete(reason);
          await this.repository.remove(room);
          break;
      }
    });
  }

  private async setAccess(channel: VoiceChannel, room: VoiceRoom, action: "lock" | "unlock" | "hide" | "show", reason: string): Promise<void> {
    await channel.permissionOverwrites.set(this.accessOverwrites(channel, room, action), reason);
  }

  private accessOverwrites(channel: VoiceChannel, room: VoiceRoom, action: "lock" | "unlock" | "hide" | "show" | "reset") {
    const bit = action === "reset" ? PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel
      : action === "lock" || action === "unlock" ? PermissionFlagsBits.Connect : PermissionFlagsBits.ViewChannel;
    const deny = action === "lock" || action === "hide";
    const overwrites = channel.permissionOverwrites.cache.map((entry) => ({ id: entry.id, type: entry.type, allow: entry.allow.bitfield, deny: entry.deny.bitfield }));
    if (!overwrites.some((entry) => entry.id === channel.guild.id)) overwrites.push({ id: channel.guild.id, type: 0, allow: 0n, deny: 0n });
    for (const entry of overwrites) {
      if (entry.type !== 0) continue; // Dev note: Explicit invitations survive the lock change.
      const baseline = room.role_permissions.find((role) => role.id === entry.id);
      entry.allow = (entry.allow & ~bit) | (deny ? 0n : BigInt(baseline?.allow ?? "0") & bit);
      entry.deny = (entry.deny & ~bit) | (deny ? bit : BigInt(baseline?.deny ?? "0") & bit);
    }
    return overwrites;
  }

  private async createRoom(member: GuildMember, joinId: string, categoryId: string): Promise<void> {
    if (member.voice.channelId !== joinId) return;
    const existing = await this.repository.owned(member.guild.id, member.id);
    if (existing) {
      const channel = await this.recoverRoom(member.guild, existing);
      if (channel && member.voice.channelId === joinId) await member.voice.setChannel(channel, "Return to your voice room");
      return;
    }
    const category = await member.guild.channels.fetch(categoryId);
    if (category?.type !== ChannelType.GuildCategory) throw new Error("Temporary voice category is unavailable.");
    const cooldownKey = `${member.guild.id}:${member.id}`;
    if (Date.now() - (this.createdAt.get(cooldownKey) ?? 0) < 30_000) return;
    this.createdAt.delete(cooldownKey);
    this.createdAt.set(cooldownKey, Date.now());
    if (this.createdAt.size > 5_000) this.createdAt.delete(this.createdAt.keys().next().value!);
    const room: VoiceRoom = {
      guild_id: member.guild.id, owner_id: member.id, channel_id: null, category_id: categoryId,
      creation_key: `jtc-${randomUUID()}`,
      role_permissions: category.permissionOverwrites.cache.filter((entry) => entry.type === 0).map((entry) => ({ id: entry.id, type: 0, allow: entry.allow.bitfield.toString(), deny: entry.deny.bitfield.toString() })),
    };
    if (!await this.repository.reserve(room)) return;
    // Dev note: The random name marks a trail through Discord/PostgreSQL crash country.
    const overwrites = category.permissionOverwrites.cache.filter((entry) => entry.id !== member.id && entry.id !== this.client.user!.id).map((entry) => ({ id: entry.id, type: entry.type, allow: entry.allow.bitfield, deny: entry.deny.bitfield }));
    overwrites.push({ id: member.id, type: 1, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak | PermissionFlagsBits.Stream, deny: 0n });
    overwrites.push({ id: this.client.user!.id, type: 1, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.MoveMembers, deny: 0n });
    const channel = await member.guild.channels.create({ name: room.creation_key, type: ChannelType.GuildVoice, parent: categoryId, permissionOverwrites: overwrites, reason: `Join to create for ${member.id}` });
    await this.repository.attach(room, channel.id);
    room.channel_id = channel.id;
    await channel.setName(defaultVoiceRoomName(member.displayName));
    if (member.voice.channelId === joinId) await member.voice.setChannel(channel, "Your temporary voice room");
    else await this.removeIfEmpty(member.guild, room);
  }

  private async recoverRoom(guild: Guild, room: VoiceRoom): Promise<VoiceChannel | null> {
    if (room.channel_id) {
      try {
        const channel = await guild.channels.fetch(room.channel_id);
        if (channel?.type === ChannelType.GuildVoice) return channel;
        if (channel) throw new Error("Saved temporary voice channel has an unexpected type.");
      } catch (error) { if (!missingChannel(error)) throw error; }
    } else {
      const channels = await guild.channels.fetch();
      const channel = channels.find((entry) => entry?.type === ChannelType.GuildVoice && entry.name === room.creation_key && entry.parentId === room.category_id);
      if (channel?.type === ChannelType.GuildVoice) {
        await this.repository.attach(room, channel.id);
        room.channel_id = channel.id;
        return channel;
      }
    }
    await this.repository.remove(room);
    return null;
  }

  private async removeIfEmpty(guild: Guild, room: VoiceRoom): Promise<void> {
    const channel = await this.recoverRoom(guild, room);
    if (!channel || channel.members.size > 0) return;
    try { await channel.delete("Temporary voice room is empty"); }
    catch (error) { if (!missingChannel(error)) throw error; }
    await this.repository.remove(room);
  }

  private async reconcile(): Promise<void> {
    if (this.reconciling || this.stopped) return;
    this.reconciling = true;
    try {
      // Dev note: Each shard patrols only its own slice of Arrakis.
      for (const guild of this.client.guilds.cache.values()) {
        if (this.stopped) break;
        if (!guild.available) continue;
        try {
          await this.serial(guild.id, async () => {
            for (const room of await this.repository.rooms(guild.id)) {
              try { await this.removeIfEmpty(guild, room); }
              catch (error) { this.logger.error(`Unable to recover temporary voice room in guild ${guild.id}.`, error); }
            }
            const settings = await this.repository.settings(guild.id);
            if (!settings?.enabled) return;
            const join = await guild.channels.fetch(settings.join_channel_id);
            if (join?.type !== ChannelType.GuildVoice) return;
            for (const member of join.members.values()) {
              if (!member.user.bot) {
                try { await this.createRoom(member, join.id, settings.category_id); }
                catch (error) { this.logger.error(`Unable to create temporary voice room in guild ${guild.id}.`, error); }
              }
            }
          });
        } catch (error) { this.logger.error(`Unable to reconcile voice rooms in guild ${guild.id}.`, error); }
      }
    } finally { this.reconciling = false; }
  }
}
