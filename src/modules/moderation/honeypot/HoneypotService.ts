import { PermissionFlagsBits, type Client, type Message } from "discord.js";
import type { HoneypotConfig } from "../../../infrastructure/config/honeypot";
import { createLogger } from "../../../client/logger";
import { hasStaffRole } from "../../../support/access/staffAccess";

const logger = createLogger("HONEYPOT");
const MODERATION_PERMISSIONS = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers];

class HoneypotService {
  private readonly activeMembers = new Set<string>();
  private readonly seenMessages = new Set<string>();

  public constructor(private readonly client: Client, public readonly config: Readonly<HoneypotConfig>) {}

  public isHoneypot(message: Message): boolean {
    return message.guildId === this.config.guildId && message.channelId === this.config.channelId;
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!this.isHoneypot(message) || !message.guild || message.author.bot || message.webhookId || message.system) return;
    if (this.seenMessages.has(message.id) || this.activeMembers.has(message.author.id)) return;
    this.seenMessages.add(message.id);
    if (this.seenMessages.size > 1000) this.seenMessages.delete(this.seenMessages.values().next().value!);
    this.activeMembers.add(message.author.id);
    try {
      const outcomes: string[] = [];
      // Fetch current roles before acting; a stale cache is no place for a gom jabbar.
      const member = await message.guild.members.fetch({ user: message.author.id, force: true }).catch(() => null);
      if (!member) {
        outcomes.push("No action: unable to resolve current guild membership.");
      } else {
        const isStaff = Boolean(hasStaffRole(member));
        if (member.id === message.guild.ownerId || isStaff || member.permissions.any(MODERATION_PERMISSIONS)) return;
        try {
          await message.delete();
          outcomes.push("Message deleted.");
        } catch (error: unknown) {
          logger.error("Unable to delete honeypot message.", error);
          outcomes.push("Message deletion failed; check Manage Messages permission.");
        }
        const reason = `Honeypot triggered in channel ${message.channelId}; message ${message.id}`;
        try {
          if (this.config.action === "ban") {
            if (!member.bannable) throw new Error("Member is not bannable: check Ban Members permission and role hierarchy.");
            await member.ban({ reason, deleteMessageSeconds: 0 });
            outcomes.push("Member banned.");
          } else if (this.config.action === "timeout") {
            if (!member.moderatable) throw new Error("Member is not moderatable: check Moderate Members permission and role hierarchy.");
            const until = Date.now() + this.config.timeoutMinutes * 60_000;
            if ((member.communicationDisabledUntilTimestamp ?? 0) < until) await member.timeout(this.config.timeoutMinutes * 60_000, reason);
            outcomes.push(`Member timed out for at least ${this.config.timeoutMinutes} minutes.`);
          } else {
            outcomes.push("Log mode: no member sanction.");
          }
        } catch (error: unknown) {
          logger.error("Honeypot moderation action failed.", error);
          outcomes.push(`${this.config.action} failed; check bot permissions and role hierarchy.`);
        }
      }
      const content = ["Honeypot incident", `Guild: ${message.guildId}`, `User: ${message.author.id}`, `Channel: ${message.channelId}`, `Message: ${message.id}`, `Configured action: ${this.config.action}`, ...outcomes].join("\n");
      logger.warn(content);
      try {
        const channel = await this.client.channels.fetch(this.config.logChannelId);
        if (!channel || !("guildId" in channel) || channel.guildId !== this.config.guildId || !channel.isSendable()) throw new Error("Honeypot log channel must be sendable and belong to the configured guild.");
        await channel.send({ content, allowedMentions: { parse: [] } });
      } catch (error: unknown) {
        logger.error("Unable to send honeypot incident to its log channel.", error);
      }
    } finally {
      this.activeMembers.delete(message.author.id);
    }
  }
}

export { HoneypotService };
