import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import { readStaffApplicationAnswers } from "../../../modules/community/applications/staffApplicationForm";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

class StaffApplicationModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return interaction.customId === "staff-application:submit" || interaction.customId.startsWith("staff-application-review:") ? this.some() : this.none();
  }

  protected override async handle(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const service = container.client.staffApplications;
    if (!service || !interaction.guild) {
      await interaction.editReply("The staff application system is not available right now.");
      return;
    }
    if (interaction.customId === "staff-application:submit") {
      await interaction.editReply(await service.submit(interaction, readStaffApplicationAnswers(interaction.fields)));
      return;
    }
    if (!service.canReview(interaction)) {
      await interaction.editReply("Only configured staff reviewers can decide applications.");
      return;
    }
    const [, decision, id] = interaction.customId.split(":");
    if ((decision !== "accepted" && decision !== "denied") || !id) {
      await interaction.editReply("This application review is no longer valid.");
      return;
    }
    const reason = interaction.fields.getTextInputValue("staff-review-reason").trim();
    await interaction.editReply(await service.review(interaction, id, decision, reason));
  }
}

export { StaffApplicationModal };
