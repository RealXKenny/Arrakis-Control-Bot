import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

import { createCaptcha } from "../../shared/utils/captchaStore";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
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

class MemberCaptchaButton extends RateLimitedInteractionHandler<ButtonInteraction> {
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

export { MemberCaptchaButton };
