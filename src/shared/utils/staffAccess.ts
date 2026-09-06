import type { GuildMember } from "discord.js";

const STAFF_ROLE_KEYS: string[] = ["TRIAL_STAFF_ROLE_ID", "MODERATOR_ROLE_ID", "SENIOR_MODERATOR_ROLE_ID", "ADMINISTRATOR_ROLE_ID", "HEAD_ADMINISTRATOR_ROLE_ID", "OWNER_ROLE_ID"];

function hasStaffRole(member: GuildMember | null | undefined): boolean {
  return STAFF_ROLE_KEYS.map((key) => process.env[key])
    .filter((roleId): roleId is string => Boolean(roleId))
    .some((roleId) => member?.roles.cache.has(roleId));
}

export { hasStaffRole };
