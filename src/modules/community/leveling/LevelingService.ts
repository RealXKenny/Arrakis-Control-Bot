import { createHash } from "node:crypto";
import {
  ContainerBuilder,
  escapeMarkdown,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
} from "discord.js";
import type { LevelRoleConfig } from "../../../infrastructure/config/leveling";
import type { LevelEvent, LevelProfile, LevelStorage } from "../../../infrastructure/database/leveling/LevelRepository";
import { achievementProgressLabel, achievementsByIds, eligibleAchievements, highestAchievementPerKind, type LevelAchievement } from "./achievements";
import { ACHIEVEMENT_CARD_FILENAMES, LEVEL_UP_CARD_FILENAME, createAchievementCard, createLevelUpCard } from "./announcementCards";
import { LEVEL_ROLE_TIERS, roleTierForLevel } from "./levelRoles";
import { MESSAGE_REPEAT_WINDOW_MS, MESSAGE_XP_COOLDOWN_MS, VOICE_XP_COOLDOWN_MS, XP_PER_VOICE_MINUTE, levelForXp, messageXp } from "./levelProgress";

const EVENT_CACHE_MS = 15_000;
const VOICE_TICK_MS = 60_000;

class LevelingService {
  private voiceTimer?: ReturnType<typeof setInterval>;
  private voiceTickRunning = false;
  private readonly eventCache = new Map<string, { event: LevelEvent | null; expiresAt: number }>();
  private readonly invalidAnnouncementChannelWarnings = new Set<string>();

  public constructor(
    private readonly client: Client,
    private readonly storage: LevelStorage,
    private readonly roleConfig: Readonly<LevelRoleConfig> = {},
    private readonly reportError: (message: string, error: unknown) => void = () => undefined,
  ) {}

  public initialize(): Promise<void> {
    return this.storage.initialize();
  }

  public start(): void {
    if (this.voiceTimer) return;
    // Dev note: Voice XP is harvested by the minute; even Shai-Hulud respects the cooldown.
    this.voiceTimer = setInterval(() => { void this.awardVoiceActivity(); }, VOICE_TICK_MS);
  }

  public stop(): void {
    if (this.voiceTimer) clearInterval(this.voiceTimer);
    this.voiceTimer = undefined;
  }

  public profile(guildId: string, userId: string): Promise<LevelProfile> {
    return this.storage.profile(guildId, userId);
  }

  public leaderboard(guildId: string, limit = 10): Promise<LevelProfile[]> {
    return this.storage.leaderboard(guildId, limit);
  }

  public async multiplier(member: GuildMember): Promise<number> {
    const event = await this.eventForGuild(member.guild.id);
    return activityMultiplier(member, event, Date.now());
  }

  public async scheduleEvent(guildId: string, startsAt: Date, durationMinutes: number, createdBy: string): Promise<LevelEvent> {
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 10_080) {
      throw new Error("Double-XP duration must be between 15 minutes and 7 days.");
    }
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const event = await this.storage.scheduleEvent(guildId, startsAt, endsAt, createdBy);
    this.eventCache.delete(guildId);
    return event;
  }

  public eventStatus(guildId: string): Promise<LevelEvent | null> {
    return this.eventForGuild(guildId, true);
  }

  public async stopEvent(guildId: string): Promise<boolean> {
    const stopped = await this.storage.stopEvent(guildId);
    this.eventCache.delete(guildId);
    return stopped;
  }

  public roleStatus(guild: Guild): Array<{ name: string; level: number; configured: boolean; present: boolean; manageable: boolean }> {
    return LEVEL_ROLE_TIERS.map((tier) => {
      const roleId = this.roleConfig[tier.configKey];
      const role = roleId ? guild.roles.cache.get(roleId) : undefined;
      return { name: tier.name, level: tier.level, configured: Boolean(roleId), present: Boolean(role), manageable: role?.editable ?? false };
    });
  }

  public async handleMessage(message: Message): Promise<void> {
    // Dev note: Bots farming bot XP would be efficient, unsettling, and terrible for morale.
    if (!message.guildId || !message.guild || !message.member || message.author.bot || message.webhookId || message.system || message.content.trim().length < 3) return;

    const event = await this.eventForGuild(message.guildId);
    const multiplier = activityMultiplier(message.member, event, Date.now());
    const baseXp = messageXp(message.content, message.attachments.size, Boolean(message.reference));
    const awardedXp = baseXp * multiplier;
    const fingerprint = createHash("sha256").update(normalizeMessage(message.content)).digest("hex");
    const profile = await this.storage.awardMessageXp(
      message.guildId,
      message.author.id,
      awardedXp,
      MESSAGE_XP_COOLDOWN_MS,
      fingerprint,
      MESSAGE_REPEAT_WINDOW_MS,
    );
    if (!profile) return;

    const newLevel = levelForXp(profile.xp);
    const previousLevel = levelForXp(Math.max(0, profile.xp - awardedXp));
    await this.syncMemberRole(message.member, newLevel);
    await this.announceProgress(message.member, profile, previousLevel, newLevel);
  }

  public async awardVoiceActivity(): Promise<void> {
    if (this.voiceTickRunning) return;
    this.voiceTickRunning = true;
    try {
      for (const guild of this.client.guilds.cache.values()) await this.awardGuildVoiceActivity(guild);
    } catch (error: unknown) {
      this.reportError("Unable to award voice activity XP.", error);
    } finally {
      this.voiceTickRunning = false;
    }
  }

  private async awardGuildVoiceActivity(guild: Guild): Promise<void> {
    const event = await this.eventForGuild(guild.id);
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased() || channel.id === guild.afkChannelId) continue;
      const members = [...channel.members.values()].filter(isEligibleVoiceMember);
      if (members.length < 2) continue;

      for (const member of members) {
        try {
          const multiplier = activityMultiplier(member, event, Date.now());
          const awardedXp = XP_PER_VOICE_MINUTE * multiplier;
          const profile = await this.storage.awardVoiceXp(guild.id, member.id, awardedXp, VOICE_XP_COOLDOWN_MS);
          if (profile) {
            const newLevel = levelForXp(profile.xp);
            const previousLevel = levelForXp(Math.max(0, profile.xp - awardedXp));
            await this.syncMemberRole(member, newLevel);
            await this.announceProgress(member, profile, previousLevel, newLevel);
          }
        } catch (error: unknown) {
          this.reportError(`Unable to award voice XP to member ${member.id} in guild ${guild.id}.`, error);
        }
      }
    }
  }

  private async announceProgress(
    member: GuildMember,
    profile: LevelProfile,
    previousLevel: number,
    newLevel: number,
  ): Promise<void> {
    const destination = this.announcementDestination(member.guild);
    if (!destination) return;
    const eligible = eligibleAchievements(profile);
    const claimedIds = await this.storage.claimAchievements(profile.guildId, profile.userId, eligible.map((achievement) => achievement.id));
    const achievements = highestAchievementPerKind(achievementsByIds(claimedIds));

    if (newLevel > previousLevel) await this.sendLevelUpAnnouncement(destination, member, profile, newLevel);
    for (const achievement of achievements) await this.sendAchievementAnnouncement(destination, member, achievement);
  }

  private announcementDestination(guild: Guild): AnnouncementDestination | null {
    const channelId = this.roleConfig.announcementChannelId;
    if (!channelId) return null;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isSendable()) {
      const warningKey = `${guild.id}:${channelId}`;
      // Dev note: One warning is enough; shouting into a missing channel does not make it more present.
      if (!this.invalidAnnouncementChannelWarnings.has(warningKey)) {
        this.invalidAnnouncementChannelWarnings.add(warningKey);
        this.reportError(`Level announcement channel ${channelId} is missing or not sendable in guild ${guild.id}.`, new Error("Invalid level announcement channel"));
      }
      return null;
    }
    this.invalidAnnouncementChannelWarnings.delete(`${guild.id}:${channelId}`);
    return channel;
  }

  private async sendLevelUpAnnouncement(destination: AnnouncementDestination, member: GuildMember, profile: LevelProfile, level: number): Promise<void> {
    const displayName = member.displayName;
    const image = await createLevelUpCard({ user: member.user, displayName, profile, level });
    const card = new ContainerBuilder()
      .setAccentColor(0xe7ad55)
      .addTextDisplayComponents((text) => text.setContent(`## 🌟 The sands recognize you, ${escapeMarkdown(displayName)}. You have advanced to level ${level}.`))
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${LEVEL_UP_CARD_FILENAME}`)
          .setDescription(`${displayName} advanced to Arrakis community level ${level}`),
      ));
    await destination.send(announcementPayload(card, image));
  }

  private async sendAchievementAnnouncement(destination: AnnouncementDestination, member: GuildMember, achievement: LevelAchievement): Promise<void> {
    const displayName = member.displayName;
    const image = await createAchievementCard({ user: member.user, displayName, achievement });
    const card = new ContainerBuilder()
      .setAccentColor(achievementColor(achievement))
      .addTextDisplayComponents((text) => text.setContent(
        `## 🏆 The sands honor ${escapeMarkdown(displayName)} — achievement unlocked: ${escapeMarkdown(achievement.name)} (${achievement.tier})!\n-# ${achievementProgressLabel(achievement)}`,
      ))
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${ACHIEVEMENT_CARD_FILENAMES[achievement.kind]}`)
          .setDescription(`${displayName} unlocked ${achievement.name} (${achievement.tier})`),
      ));
    await destination.send(announcementPayload(card, image));
  }

  private async syncMemberRole(member: GuildMember, level: number): Promise<void> {
    const tier = roleTierForLevel(level);
    const levelRoles = LEVEL_ROLE_TIERS
      .map((candidate) => this.roleConfig[candidate.configKey])
      .filter((roleId) => roleId !== undefined)
      .map((roleId) => member.guild.roles.cache.get(roleId))
      .filter((role) => role !== undefined);
    const targetId = tier ? this.roleConfig[tier.configKey] : undefined;
    const target = targetId ? member.guild.roles.cache.get(targetId) : undefined;
    // Dev note: A missing promotion badge should not strip the one the traveler already earned.
    if (tier && !target) return;
    const assignedObsolete = levelRoles.filter((role) => role.id !== target?.id && member.roles.cache.has(role.id));
    const blocked = assignedObsolete.find((role) => !role.editable);
    if (blocked) throw new Error(`Level role ${blocked.name} is above the bot's highest role.`);

    if (assignedObsolete.length) await member.roles.remove(assignedObsolete, "Community level tier updated");
    if (target && !member.roles.cache.has(target.id)) {
      if (!target.editable) throw new Error(`Level role ${target.name} is above the bot's highest role.`);
      await member.roles.add(target, `Reached community level ${level}`);
    }
  }

  private async eventForGuild(guildId: string, fresh = false): Promise<LevelEvent | null> {
    const now = Date.now();
    const cached = this.eventCache.get(guildId);
    if (!fresh && cached && cached.expiresAt > now) return cached.event;
    const event = await this.storage.upcomingEvent(guildId);
    this.eventCache.set(guildId, { event, expiresAt: Math.min(now + EVENT_CACHE_MS, event?.endsAt.getTime() ?? now + EVENT_CACHE_MS) });
    return event;
  }
}

interface AnnouncementDestination {
  send(options: MessageCreateOptions): Promise<unknown>;
}

function announcementPayload(card: ContainerBuilder, image: Awaited<ReturnType<typeof createLevelUpCard>>): MessageCreateOptions {
  return {
    components: [card],
    files: [image],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function achievementColor(achievement: LevelAchievement): number {
  if (achievement.kind === "message") return 0xd9823b;
  if (achievement.kind === "voice") return 0x66c7d5;
  return 0xb48cff;
}

function activityMultiplier(member: GuildMember, event: LevelEvent | null, now: number): number {
  const boosterMultiplier = member.premiumSince ? 2 : 1;
  const eventMultiplier = event && event.startsAt.getTime() <= now && event.endsAt.getTime() > now ? 2 : 1;
  return boosterMultiplier * eventMultiplier;
}

function isEligibleVoiceMember(member: GuildMember): boolean {
  return !member.user.bot && !member.voice.selfDeaf && !member.voice.serverDeaf && !member.voice.suppress;
}

function normalizeMessage(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export { LevelingService, activityMultiplier, isEligibleVoiceMember, normalizeMessage };
