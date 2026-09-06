import { ButtonInteraction, FileUploadBuilder, ModalBuilder } from "discord.js";

module.exports = {
  customId: "blueprint-upload",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const fileUpload = new FileUploadBuilder().setCustomId("blueprint-file").setMinValues(1).setMaxValues(1).setRequired(true);

    const modal = new ModalBuilder()
      .setCustomId("blueprint-upload-modal")
      .setTitle("Upload Dune Blueprint")
      .addLabelComponents((label) => label.setLabel("Blueprint JSON file").setDescription("Upload exactly one .json blueprint file (maximum 32 MB).").setFileUploadComponent(fileUpload));

    await interaction.showModal(modal);
  },
};
