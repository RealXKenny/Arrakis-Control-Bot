import { PermissionFlagsBits, type APIInteractionGuildMember, type GuildMember, type PermissionsBitField } from "discord.js";
import { getConfiguredStaffRoleIds } from "../../../support/access/staffAccess";

interface AccessSubject {
  user: { id: string };
  guild: { ownerId: string } | null;
  member: GuildMember | APIInteractionGuildMember | null;
  memberPermissions: Readonly<PermissionsBitField> | null;
}

function memberRoleIds(member: AccessSubject["member"]): string[] {
  if (!member) return [];
  return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

/**
 * Staff for the suggestion forum: the server owner, a configured staff role, or anyone who can
 * manage threads. Uses the roles Discord sends with the interaction, so no fetch is needed
 * before acknowledging it.
 */
function isSuggestionStaff(subject: AccessSubject): boolean {
  if (subject.guild && subject.user.id === subject.guild.ownerId) return true;
  if (subject.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) return true;
  const staffRoles = getConfiguredStaffRoleIds();
  return memberRoleIds(subject.member).some((roleId) => staffRoles.includes(roleId));
}

export { isSuggestionStaff };
export type { AccessSubject };
