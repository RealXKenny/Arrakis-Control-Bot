import { GuildMember, MessageFlags, StringSelectMenuInteraction } from "discord.js";

import { getConfiguredRoleIds } from "../../../shared/constants/selfAssignableRoles";

module.exports = {
  customId: "self-assignable-roles",

  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guild) {
      throw new Error("Self-assignable roles can only be used inside a guild.");
    }

    const allowedRoleIds = getConfiguredRoleIds();
    const selectedRoleIds = interaction.values.filter((id) => allowedRoleIds.has(id));

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!(member instanceof GuildMember)) {
      throw new Error("Unable to resolve the interacting guild member.");
    }

    const currentRoleIds = [...allowedRoleIds].filter((id) => member.roles.cache.has(id));

    if (currentRoleIds.length > 0) {
      await member.roles.remove(currentRoleIds, "Self-assignable role update");
    }

    if (selectedRoleIds.length > 0) {
      await member.roles.add(selectedRoleIds, "Self-assignable role selection");
    }

    const roleCount = selectedRoleIds.length;
    const message = roleCount ? `Your roles were updated. Selected ${roleCount} role${roleCount === 1 ? "" : "s"}.` : "Your self-assignable roles were cleared.";

    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
  },
};
