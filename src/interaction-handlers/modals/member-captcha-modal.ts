import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, ModalSubmitInteraction } from "discord.js";

import { verifyCaptcha } from "../../shared/utils/captchaStore";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
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

class MemberCaptchaModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ModalSubmitInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { MemberCaptchaModal };
