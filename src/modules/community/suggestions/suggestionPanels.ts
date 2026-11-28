import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, escapeMarkdown,
} from "discord.js";
import type { SuggestionFeature } from "../../../infrastructure/database/suggestions/SuggestionRepository";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import { PANEL_COLORS, panelFooter, panelHeading } from "../../../shared/discord/panelStyle";
import { describeDiscussion, type DiscussionSummary } from "./discussionSummary";
import { STATUS_MARKERS } from "./replyComposer";
import { PANEL_STATUSES, STATUS_DEFINITIONS, type SuggestionStatus } from "./suggestionTags";

const STATUS_BUTTON_PREFIX = "suggestion-status:";
const STAFF_STATUS_PREFIX = "suggestion-staff:";
const SUMMARY_BUTTON_ID = "suggestion-summary";
const SIMILAR_BUTTON_ID = "suggestion-similar";
const FEATURE_MENU_PREFIX = "suggestion-feature:";
const PANEL_HEADING = "Suggestion assistant";
const MAX_LISTED_POSTS = 8;

interface RelatedPost {
  threadId: string;
  title: string;
  score: number;
  status?: SuggestionStatus;
}

interface AssistantPanelInput {
  reply: string;
  status?: SuggestionStatus;
  related: readonly RelatedPost[];
  updatedBy?: string;
  featureName?: string;
  /** GitHub work the assistant linked to this suggestion, newest first. */
  work?: readonly PanelWorkLink[];
}

interface PanelWorkLink {
  kind: string;
  title: string;
  url: string;
}

const WORK_LABELS: Readonly<Record<string, string>> = Object.freeze({ issue: "Issue", pull: "Pull request", commit: "Commit", release: "Release" });

const STATUS_BUTTON_STYLES: Readonly<Record<SuggestionStatus, ButtonStyle>> = Object.freeze({
  under_review: ButtonStyle.Secondary,
  planned: ButtonStyle.Primary,
  in_progress: ButtonStyle.Primary,
  back_burner: ButtonStyle.Secondary,
  not_doing: ButtonStyle.Danger,
  implemented: ButtonStyle.Success,
});

/** What each staff button does, shown on the panel so nobody has to guess. */
const STATUS_HELP: Readonly<Record<SuggestionStatus, string>> = Object.freeze({
  under_review: "Waiting for a staff decision.",
  planned: "Accepted and on the to-do list.",
  in_progress: "Someone is building it now.",
  back_burner: "Good idea, but on hold for later.",
  not_doing: "Declined. The thread stays open.",
  implemented: "Done and live on the server.",
});

function statusLabel(status: SuggestionStatus | undefined): string {
  const resolved = status ?? "under_review";
  return `${STATUS_MARKERS[resolved]} ${STATUS_DEFINITIONS[resolved].label}`;
}

function relatedLines(related: readonly RelatedPost[]): string[] {
  return related.slice(0, MAX_LISTED_POSTS).map((post) => `- <#${post.threadId}> · ${Math.round(post.score * 100)}% match${post.status ? ` · ${statusLabel(post.status)}` : ""}`);
}

function statusButtonRow(current: SuggestionStatus | undefined): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(PANEL_STATUSES.map((status) => new ButtonBuilder()
    .setCustomId(`${STATUS_BUTTON_PREFIX}${status}`)
    .setLabel(STATUS_DEFINITIONS[status].label)
    .setEmoji(STATUS_MARKERS[status])
    .setStyle(STATUS_BUTTON_STYLES[status])
    .setDisabled(status === current)));
}

interface StaffPanelInput {
  threadId: string;
  guildId: string;
  title: string;
  body: string;
  authorId?: string;
  status?: SuggestionStatus;
  categories: readonly string[];
  locked: boolean;
  createdAt: Date;
  updatedBy?: string;
}

/** The copy of a suggestion in the staff channel: what it asks for and the status buttons, without opening the post. */
function createStaffPanel(input: StaffPanelInput): ContainerBuilder {
  const status = input.status ?? "under_review";
  const excerpt = input.body.trim() ? truncateDiscordText(input.body.trim(), 400, "…") : "_No description._";
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(PANEL_STATUSES.map((entry) => new ButtonBuilder()
    .setCustomId(`${STAFF_STATUS_PREFIX}${entry}:${input.threadId}`)
    .setLabel(STATUS_DEFINITIONS[entry].label)
    .setEmoji(STATUS_MARKERS[entry])
    .setStyle(STATUS_BUTTON_STYLES[entry])
    .setDisabled(entry === status)));
  const open = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open post").setURL(`https://discord.com/channels/${input.guildId}/${input.threadId}`),
  );
  return new ContainerBuilder().setAccentColor(status === "not_doing" ? PANEL_COLORS.danger : status === "implemented" ? PANEL_COLORS.success : PANEL_COLORS.accent)
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText([
      panelHeading(escapeMarkdown(truncateDiscordText(input.title, 120, "…")), 3),
      `<#${input.threadId}>${input.authorId ? ` · by <@${input.authorId}>` : ""} · posted <t:${Math.floor(input.createdAt.getTime() / 1_000)}:R>`,
      `**Status:** ${statusLabel(status)}${input.locked ? " · 🔒 locked" : ""}${input.categories.length ? ` · ${input.categories.map((category) => escapeMarkdown(category)).join(", ")}` : ""}`,
      "",
      escapeMarkdown(excerpt),
    ].join("\n"), 1_800)))
    .addActionRowComponents(buttons)
    .addActionRowComponents(open)
    .addTextDisplayComponents((text) => text.setContent(panelFooter(undefined, input.updatedBy ? `Changes post in the suggestion • Last changed by <@${input.updatedBy}>` : "Changes post in the suggestion")));
}

function toolButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SUMMARY_BUTTON_ID).setLabel("Summarize discussion").setEmoji("📝").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(SIMILAR_BUTTON_ID).setLabel("Find similar").setEmoji("🔎").setStyle(ButtonStyle.Secondary),
  );
}

/** The panel posted under every suggestion: assistant reply, status, related posts and staff buttons. */
function createAssistantPanel(input: AssistantPanelInput): ContainerBuilder {
  const status = input.status ?? "under_review";
  const container = new ContainerBuilder().setAccentColor(status === "not_doing" ? PANEL_COLORS.danger : status === "implemented" ? PANEL_COLORS.success : PANEL_COLORS.accent)
    .addTextDisplayComponents((text) => text.setContent(`${panelHeading(PANEL_HEADING, 3)}\n${truncateDiscordText(input.reply, 1_200)}`))
    .addTextDisplayComponents((text) => text.setContent([
      `**Status:** ${statusLabel(status)} · ${STATUS_HELP[status]}`,
      input.featureName ? `**Feature:** ${escapeMarkdown(truncateDiscordText(input.featureName, 80, "…"))}` : undefined,
    ].filter(Boolean).join("\n")));
  if (input.related.length) container.addTextDisplayComponents((text) => text.setContent(`**Possibly related**\n${relatedLines(input.related.slice(0, 3)).join("\n")}`));
  const work = input.work ?? [];
  if (work.length) {
    container.addTextDisplayComponents((text) => text.setContent(`**On GitHub**\n${work.slice(0, 3).map((item) => `- ${WORK_LABELS[item.kind] ?? "Link"}: [${escapeMarkdown(truncateDiscordText(item.title.replace(/[[\]]/g, ""), 80, "…"))}](<${item.url}>)`).join("\n")}`));
  }
  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent([
      "**Staff controls**",
      ...PANEL_STATUSES.map((entry) => `${STATUS_MARKERS[entry]} **${STATUS_DEFINITIONS[entry].label}**: ${STATUS_HELP[entry]}`),
    ].join("\n")))
    .addActionRowComponents(statusButtonRow(status))
    .addActionRowComponents(toolButtonRow())
    .addTextDisplayComponents((text) => text.setContent(panelFooter(undefined, input.updatedBy ? `Status buttons are staff only • Last changed by <@${input.updatedBy}>` : "Status buttons are staff only")));
  return container;
}

function createSimilarPanel(title: string, related: readonly RelatedPost[]): ContainerBuilder {
  const body = related.length
    ? relatedLines(related).join("\n")
    : "No similar posts were found. This looks like a new idea.";
  return new ContainerBuilder().setAccentColor(PANEL_COLORS.info)
    .addTextDisplayComponents((text) => text.setContent(`${panelHeading("Similar suggestions", 3)}\nPosts that read like **${escapeMarkdown(truncateDiscordText(title, 120, "…"))}**:\n${body}`))
    .addTextDisplayComponents((text) => text.setContent(panelFooter(undefined, "Matched by wording, not meaning")));
}

function createSummaryPanel(title: string, summary: DiscussionSummary): ContainerBuilder {
  const stance = summary.supportCount || summary.opposeCount
    ? `${summary.supportCount} in favour · ${summary.opposeCount} against`
    : "No clear votes in the replies yet";
  const points = summary.keyPoints.length
    ? summary.keyPoints.map((point) => `- <@${point.authorId}>: ${escapeMarkdown(point.text)}`).join("\n")
    : "- The discussion is too short to pick out key points yet.";
  const window = summary.firstAt && summary.lastAt ? ` · <t:${Math.floor(summary.firstAt.getTime() / 1_000)}:R> to <t:${Math.floor(summary.lastAt.getTime() / 1_000)}:R>` : "";
  return new ContainerBuilder().setAccentColor(PANEL_COLORS.violet)
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText([
      panelHeading("Discussion summary", 3),
      `**${escapeMarkdown(truncateDiscordText(title, 120, "…"))}**`,
      describeDiscussion(summary),
      `-# ${summary.messageCount} messages from ${summary.participantCount} members${window} · ${stance}`,
      "",
      "**Key points**",
      points,
    ].filter((line): line is string => line !== undefined).join("\n"), 3_500)))
    .addTextDisplayComponents((text) => text.setContent(panelFooter(undefined, "Quotes picked from the discussion")));
}

interface FeatureCandidate extends RelatedPost {
  selected: boolean;
}

function createFeatureMatchPanel(feature: SuggestionFeature, candidates: readonly FeatureCandidate[], requesterId: string): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(PANEL_COLORS.accent)
    .addTextDisplayComponents((text) => text.setContent([
      panelHeading(`Feature: ${escapeMarkdown(truncateDiscordText(feature.name, 80, "…"))}`, 3),
      candidates.length
        ? "These suggestions match the feature. Pick the ones it covers; they move to **Working on it** and their threads get an update."
        : "No matching suggestions were found. Link posts later with `/suggestions feature link`.",
      ...relatedLines(candidates),
    ].join("\n")));
  if (!candidates.length) return container;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${FEATURE_MENU_PREFIX}${feature.id}:${requesterId}`)
    .setPlaceholder("Choose the suggestions this feature covers")
    .setMinValues(1)
    .setMaxValues(candidates.length)
    .addOptions(candidates.map((candidate) => new StringSelectMenuOptionBuilder()
      .setValue(candidate.threadId)
      .setLabel(truncateDiscordText(candidate.title, 100, "…"))
      .setDescription(`${Math.round(candidate.score * 100)}% match`)
      .setDefault(candidate.selected)));
  return container
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu))
    .addTextDisplayComponents((text) => text.setContent(panelFooter(undefined, "Selection expires in 15 minutes")));
}

interface LinkOutcome {
  threadId: string;
  ok: boolean;
  detail?: string;
}

function createOutcomePanel(heading: string, intro: string, outcomes: readonly LinkOutcome[]): ContainerBuilder {
  const lines = outcomes.slice(0, 25).map((outcome) => `- <#${outcome.threadId}>: ${outcome.ok ? "updated" : escapeMarkdown(outcome.detail ?? "failed")}`);
  if (outcomes.length > 25) lines.push(`- …and ${outcomes.length - 25} more`);
  const failed = outcomes.filter((outcome) => !outcome.ok).length;
  return new ContainerBuilder().setAccentColor(failed ? PANEL_COLORS.warning : PANEL_COLORS.success)
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText([panelHeading(heading, 3), intro, ...lines].join("\n"), 3_500)));
}

function createFeatureListPanel(features: readonly SuggestionFeature[]): ContainerBuilder {
  const lines = features.length
    ? features.map((feature) => `- **${escapeMarkdown(truncateDiscordText(feature.name, 80, "…"))}** · ${feature.status === "implemented" ? `${STATUS_MARKERS.implemented} added` : `${STATUS_MARKERS.in_progress} in progress`} · ${feature.linkedCount} linked · started <t:${Math.floor(feature.createdAt.getTime() / 1_000)}:R>`)
    : ["No features yet. Start one with `/suggestions feature start`."];
  return new ContainerBuilder().setAccentColor(PANEL_COLORS.info)
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText([panelHeading("Features", 3), ...lines].join("\n"), 3_500)));
}

function isAssistantPanelContent(content: string): boolean {
  return content.includes(panelHeading(PANEL_HEADING, 3));
}

export {
  FEATURE_MENU_PREFIX, PANEL_HEADING, SIMILAR_BUTTON_ID, STAFF_STATUS_PREFIX, STATUS_BUTTON_PREFIX, STATUS_HELP, SUMMARY_BUTTON_ID,
  createAssistantPanel, createStaffPanel, createFeatureListPanel, createFeatureMatchPanel, createOutcomePanel, createSimilarPanel, createSummaryPanel, isAssistantPanelContent, statusLabel,
};
export type { AssistantPanelInput, FeatureCandidate, LinkOutcome, PanelWorkLink, RelatedPost, StaffPanelInput };
