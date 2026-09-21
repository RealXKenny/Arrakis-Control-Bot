import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { buildStaffApplicationModal, buildStaffReviewModal } from "../../../modules/community/applications/staffApplicationForm";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";

const PREFIX = "staff-application:";

class StaffApplicationButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return interaction.customId.startsWith(PREFIX) ? this.some() : this.none();
  }

  protected override async handle(interaction: ButtonInteraction): Promise<void> {
    const service = container.client.staffApplications;
    if (!service || !interaction.guild) {
      await interaction.reply({ content: "The staff application system is not available right now.", flags: MessageFlags.Ephemeral });
      return;
    }
    const [, action, id] = interaction.customId.split(":");
    if (action === "open") {
      await interaction.showModal(buildStaffApplicationModal());
      return;
    }
    if ((action !== "accept" && action !== "deny") || !id) {
      await interaction.reply({ content: "This application control is no longer valid.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!service.canReview(interaction)) {
      await interaction.reply({ content: "Only configured staff reviewers can decide applications.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildStaffReviewModal(id, action === "accept" ? "accepted" : "denied"));
  }
}

export { StaffApplicationButton };
