import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

import { createCaptcha } from "../../../shared/utils/captchaStore.js";

module.exports = {
  customId: "member-captcha",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const code = createCaptcha(interaction.user.id);

    const captchaInput = new TextInputBuilder().setCustomId("captcha-answer").setStyle(TextInputStyle.Short).setRequired(true);

    const modal = new ModalBuilder()
      .setCustomId("member-captcha-modal")
      .setTitle("Membership Verification")
      .addLabelComponents((label) => label.setLabel(`Enter this code: ${code}`).setTextInputComponent(captchaInput));

    await interaction.showModal(modal);
  },
};
