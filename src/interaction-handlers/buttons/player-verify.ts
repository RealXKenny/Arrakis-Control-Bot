import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { ButtonInteraction, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
  customId: "player-verify",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const verificationCodeInput = new TextInputBuilder().setCustomId("verification-code").setStyle(TextInputStyle.Short).setPlaceholder("ACP-XXXXXX").setRequired(true).setMinLength(10).setMaxLength(10);

    const verificationCodeLabel = new LabelBuilder().setLabel("Verification code").setTextInputComponent(verificationCodeInput);

    const modal = new ModalBuilder().setCustomId("player-verify-modal").setTitle("Verify Dune Character").addLabelComponents(verificationCodeLabel);

    await interaction.showModal(modal);
  },
};

class PlayerVerifyButton extends RateLimitedInteractionHandler<ButtonInteraction> {
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

export { PlayerVerifyButton };
