import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { ButtonInteraction, FileUploadBuilder, ModalBuilder } from "discord.js";

import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
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

class BlueprintUploadButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ButtonInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { BlueprintUploadButton };
