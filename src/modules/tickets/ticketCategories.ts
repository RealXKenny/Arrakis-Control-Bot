import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

const TICKET_CATEGORIES = [
  {
    value: "account-linking",
    label: "Account & Linking",
    description: "Discord linking, verification, or character account help",
    emoji: "🔗",
  },
  {
    value: "technical-support",
    label: "Technical Support",
    description: "Errors, bot problems, panels, or server connectivity",
    emoji: "🛠️",
  },
  {
    value: "player-report",
    label: "Report a Player",
    description: "Private conduct, rule violation, or moderation report",
    emoji: "🛡️",
  },
  {
    value: "guild-community",
    label: "Guild & Community",
    description: "Guild membership, roles, events, or community questions",
    emoji: "🏛️",
  },
  {
    value: "gameplay-server",
    label: "Gameplay & Server",
    description: "Dune gameplay, server access, characters, or recovery",
    emoji: "🏜️",
  },
  {
    value: "general-other",
    label: "General & Other",
    description: "Anything that does not fit another support category",
    emoji: "💬",
  },
] as const;

type TicketCategory = (typeof TICKET_CATEGORIES)[number];
type TicketCategoryValue = TicketCategory["value"];

function getTicketCategory(value: string | undefined): TicketCategory {
  return TICKET_CATEGORIES.find((category) => category.value === value) ?? TICKET_CATEGORIES[TICKET_CATEGORIES.length - 1];
}

function buildTicketModal(categoryValue: TicketCategoryValue): ModalBuilder {
  const category = getTicketCategory(categoryValue);
  const subject = new TextInputBuilder().setCustomId("ticket-subject").setStyle(TextInputStyle.Short).setPlaceholder("Briefly summarize the request").setMinLength(3).setMaxLength(100).setRequired(true);
  const description = new TextInputBuilder().setCustomId("ticket-description").setStyle(TextInputStyle.Paragraph).setPlaceholder("What happened? Include errors, dates, names, and relevant context.").setMinLength(20).setMaxLength(1000).setRequired(true);
  const stepsTried = new TextInputBuilder().setCustomId("ticket-steps-tried").setStyle(TextInputStyle.Paragraph).setPlaceholder("What have you already tried? Leave blank if not applicable.").setMaxLength(1000).setRequired(false);
  const impact = new TextInputBuilder().setCustomId("ticket-impact").setStyle(TextInputStyle.Paragraph).setPlaceholder("What is blocked or affected, and how urgent is this?").setMinLength(10).setMaxLength(500).setRequired(true);

  return new ModalBuilder()
    .setCustomId(`ticket-create-modal:${category.value}`)
    .setTitle(category.label)
    .addLabelComponents(
      new LabelBuilder().setLabel("Subject").setDescription("A short title staff can scan quickly.").setTextInputComponent(subject),
      new LabelBuilder().setLabel("Full details").setDescription("Explain the issue or request in detail.").setTextInputComponent(description),
      new LabelBuilder().setLabel("Steps already tried").setDescription("Optional troubleshooting or actions already taken.").setTextInputComponent(stepsTried),
      new LabelBuilder().setLabel("Impact and urgency").setDescription("Tell staff what is affected and how urgent it is.").setTextInputComponent(impact),
    );
}

export { TICKET_CATEGORIES, buildTicketModal, getTicketCategory };

export type { TicketCategory, TicketCategoryValue };
