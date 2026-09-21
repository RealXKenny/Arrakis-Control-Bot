import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { StaffApplicationAnswers, StaffApplicationStatus } from "../../../infrastructure/database/applications/StaffApplicationRepository";

const FIELD_IDS = ["staff-identity", "staff-experience", "staff-motivation", "staff-scenario", "staff-availability"] as const;

function buildStaffApplicationModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("staff-application:submit")
    .setTitle("Crimson Skies Staff Application")
    .addLabelComponents(
      field("About you", "Age range, timezone, and preferred name.", FIELD_IDS[0], TextInputStyle.Short, 20, 120),
      field("Community experience", "Tell us about relevant moderation or community experience.", FIELD_IDS[1], TextInputStyle.Paragraph, 40, 650),
      field("Why this team?", "Why do you want to help Crimson Skies?", FIELD_IDS[2], TextInputStyle.Paragraph, 40, 650),
      field("Scenario", "How would you handle two members arguing publicly?", FIELD_IDS[3], TextInputStyle.Paragraph, 40, 650),
      field("Availability", "When can you usually help, and for roughly how long?", FIELD_IDS[4], TextInputStyle.Paragraph, 15, 400),
    );
}

function buildStaffReviewModal(id: string, decision: Exclude<StaffApplicationStatus, "pending">): ModalBuilder {
  const reason = new TextInputBuilder()
    .setCustomId("staff-review-reason")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(decision === "accepted" ? "Optional welcome note or internal context" : "Explain what the applicant can improve")
    .setMaxLength(500)
    .setRequired(decision === "denied");
  return new ModalBuilder()
    .setCustomId(`staff-application-review:${decision}:${id}`)
    .setTitle(decision === "accepted" ? "Accept application" : "Deny application")
    .addLabelComponents(new LabelBuilder().setLabel("Decision reason").setDescription(decision === "accepted" ? "Optional; included in the applicant message." : "Required; included in the applicant message.").setTextInputComponent(reason));
}

function readStaffApplicationAnswers(fields: { getTextInputValue(id: string): string }): StaffApplicationAnswers {
  return {
    identity: fields.getTextInputValue(FIELD_IDS[0]).trim(),
    experience: fields.getTextInputValue(FIELD_IDS[1]).trim(),
    motivation: fields.getTextInputValue(FIELD_IDS[2]).trim(),
    scenario: fields.getTextInputValue(FIELD_IDS[3]).trim(),
    availability: fields.getTextInputValue(FIELD_IDS[4]).trim(),
  };
}

function field(label: string, description: string, id: string, style: TextInputStyle, min: number, max: number): LabelBuilder {
  return new LabelBuilder().setLabel(label).setDescription(description).setTextInputComponent(
    new TextInputBuilder().setCustomId(id).setStyle(style).setMinLength(min).setMaxLength(max).setRequired(true),
  );
}

export { buildStaffApplicationModal, buildStaffReviewModal, readStaffApplicationAnswers };
