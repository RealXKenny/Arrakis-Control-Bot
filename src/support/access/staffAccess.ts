import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

import { PRE_ACKNOWLEDGEMENT_DEADLINE_MS, withDeadline } from "../../shared/async/withDeadline";

const STAFF_ROLE_KEYS: string[] = ["TRIAL_STAFF_ROLE_ID", "MODERATOR_ROLE_ID", "SENIOR_MODERATOR_ROLE_ID", "ADMINISTRATOR_ROLE_ID", "HEAD_ADMINISTRATOR_ROLE_ID", "OWNER_ROLE_ID"];

function getConfiguredStaffRoleIds(): string[] {
  return [...new Set(STAFF_ROLE_KEYS.map((key) => process.env[key]).filter((roleId): roleId is string => Boolean(roleId)))];
}

function hasStaffRole(member: GuildMember | null | undefined): member is GuildMember {
  return getConfiguredStaffRoleIds().some((roleId) => member?.roles.cache.has(roleId));
}

function canModerateMember(actor: GuildMember, target: GuildMember, guildOwnerId: string): boolean {
  if (target.id === guildOwnerId || actor.id === target.id) {
    return false;
  }

  if (actor.id === guildOwnerId) {
    return true;
  }

  return actor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

/**
 * The acting member as of this interaction. In a cached guild, Discord sends the member's
 * current roles with the interaction, so no REST call is needed before the acknowledgement.
 * Otherwise fetch fresh roles, bounded so the interaction can still be answered.
 */
async function resolveActingMember(interaction: ChatInputCommandInteraction): Promise<GuildMember | null> {
  if (interaction.inCachedGuild()) return interaction.member;
  const fetching = interaction.guild?.members.fetch({ user: interaction.user.id, force: true });
  if (!fetching) return null;
  return withDeadline(fetching, PRE_ACKNOWLEDGEMENT_DEADLINE_MS).catch(() => null);
}

export { canModerateMember, resolveActingMember, getConfiguredStaffRoleIds, hasStaffRole };
