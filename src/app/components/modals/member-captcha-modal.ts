import { MessageFlags, ModalSubmitInteraction } from "discord.js";

import { verifyCaptcha } from "../../../shared/utils/captchaStore";

module.exports = {
  customId: "member-captcha-modal",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const answer = interaction.fields.getTextInputValue("captcha-answer");

    if (!verifyCaptcha(interaction.user.id, answer)) {
      await interaction.reply({
        content: "Captcha incorrect or expired. Try again.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const roleId = process.env.VERIFIED_MEMBER_ROLE_ID;

    if (roleId) {
      if (!interaction.guild) {
        throw new Error("Membership verification can only be completed inside a guild.");
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      await member.roles.add(roleId, "Completed membership captcha");
    }

    await interaction.reply({
      content: "Verification complete. Welcome to Arrakis!",
      flags: MessageFlags.Ephemeral,
    });
  },
};
