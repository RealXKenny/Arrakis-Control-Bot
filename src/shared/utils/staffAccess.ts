import type { GuildMember } from "discord.js";

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

export { canModerateMember, getConfiguredStaffRoleIds, hasStaffRole };
