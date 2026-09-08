import { GuildMember, MessageFlags, StringSelectMenuInteraction } from "discord.js";

import { getConfiguredRoleIds } from "../../../shared/constants/selfAssignableRoles";

module.exports = {
  customId: "self-assignable-roles",

  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      await interaction.editReply("Self-assignable roles can only be used inside a server.");
      return;
    }

    const allowedRoleIds = getConfiguredRoleIds();
    const selectedRoleIds = interaction.values.filter((id) => allowedRoleIds.has(id));

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!(member instanceof GuildMember)) {
      throw new Error("Unable to resolve the interacting guild member.");
    }

    const currentRoleIds = [...allowedRoleIds].filter((id) => member.roles.cache.has(id));
    const rolesToAdd = selectedRoleIds.filter((id) => !member.roles.cache.has(id));
    const rolesToRemove = currentRoleIds.filter((id) => !selectedRoleIds.includes(id));

    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd, "Self-assignable role selection");
    }

    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove, "Self-assignable role update");
    }

    const roleCount = selectedRoleIds.length;
    const message = roleCount ? `Your roles were updated. Selected ${roleCount} role${roleCount === 1 ? "" : "s"}.` : "Your self-assignable roles were cleared.";

    await interaction.editReply({ content: message });
  },
};
