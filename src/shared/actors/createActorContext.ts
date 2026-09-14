import type { Interaction } from "discord.js";

interface ActorContext {
  guildId: string | null;
  channelId: string | null;
  userId: string;
  username: string;
  roleIds: string[];
  interactionId: string;
  commandName: string;
}

function createActorContext(interaction: Interaction, commandName: string): ActorContext {
  const roleIds = interaction.inGuild() && interaction.member && "roles" in interaction.member && interaction.member.roles && "cache" in interaction.member.roles ? [...interaction.member.roles.cache.keys()] : [];

  return {
    guildId: interaction.guildId ?? null,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    username: interaction.user.username,
    roleIds,
    interactionId: interaction.id,
    commandName,
  };
}

export { createActorContext };

export type { ActorContext };
