import { ButtonInteraction, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

module.exports = {
  customId: "player-verify",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const verificationCodeInput = new TextInputBuilder().setCustomId("verification-code").setStyle(TextInputStyle.Short).setPlaceholder("ACP-XXXXXX").setRequired(true).setMinLength(10).setMaxLength(10);

    const verificationCodeLabel = new LabelBuilder().setLabel("Verification code").setTextInputComponent(verificationCodeInput);

    const modal = new ModalBuilder().setCustomId("player-verify-modal").setTitle("Verify Dune Character").addLabelComponents(verificationCodeLabel);

    await interaction.showModal(modal);
  },
};
