import { MessageFlags, ModalSubmitInteraction } from "discord.js";

import { verifyCaptcha } from "../../../shared/utils/captchaStore";

module.exports = {
  customId: "member-captcha-modal",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const answer = interaction.fields.getTextInputValue("captcha-answer");

    if (!verifyCaptcha(interaction.user.id, answer)) {
      await interaction.editReply({ content: "Captcha incorrect or expired. Try again." });

      return;
    }

    const roleId = process.env.VERIFIED_MEMBER_ROLE_ID;

    if (roleId) {
      if (!interaction.guild) {
        await interaction.editReply({ content: "Membership verification can only be completed inside a server." });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      await member.roles.add(roleId, "Completed membership captcha");
    }

    await interaction.editReply({ content: "Verification complete. Welcome to Arrakis!" });
  },
};
