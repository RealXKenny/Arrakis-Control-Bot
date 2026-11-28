import {
  MessageFlags, escapeMarkdown, type AnyThreadChannel, type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type StringSelectMenuInteraction,
} from "discord.js";
import { isSuggestionStaff } from "./suggestionAccess";
import { SuggestionError, type SuggestionService } from "./SuggestionService";
import {
  FEATURE_MENU_PREFIX, STATUS_BUTTON_PREFIX, createFeatureListPanel, createFeatureMatchPanel, createOutcomePanel, createSimilarPanel, createSummaryPanel, statusLabel,
} from "./suggestionPanels";
import { STATUS_DEFINITIONS, isSuggestionStatus } from "./suggestionTags";

const FEATURE_SESSION_MS = 15 * 60 * 1_000;
const FEATURE_MENU_PATTERN = /^suggestion-feature:(\d{1,18}):(\d{17,20})$/;
const STATUS_BUTTON_PATTERN = /^suggestion-status:([a-z_]+)$/;
const STAFF_STATUS_PATTERN = /^suggestion-staff:([a-z_]+):(\d{17,20})$/;
const UNAVAILABLE = "The suggestion assistant is not enabled. Set SUGGESTIONS_FORUM_CHANNEL_ID and DATABASE_URL, then restart the bot.";
const STAFF_ONLY = "Only staff can change the status of a suggestion.";
const NOT_A_POST = "Run this inside a suggestion post, or pick one with the `post` option.";

type Visibility = { flags?: MessageFlags.Ephemeral };

function safeMessage(error: unknown): string {
  return error instanceof SuggestionError ? error.message : "The suggestion assistant could not finish that. Check the bot's permissions in the forum and try again.";
}

function parseReferenceUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SuggestionError("The reference must be a full https:// link, such as a release or roadmap issue.");
  }
  if (url.protocol !== "https:") throw new SuggestionError("The reference must be an https:// link.");
  return url.toString();
}

async function resolvePost(interaction: ChatInputCommandInteraction, service: SuggestionService): Promise<AnyThreadChannel | null> {
  const option = interaction.options.getChannel("post");
  const channel = option ? await interaction.client.channels.fetch(option.id).catch(() => null) : interaction.channel;
  return service.isSuggestionThread(channel) ? channel : null;
}

async function executeSuggestionsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const service = interaction.client.suggestions;
  const group = interaction.options.getSubcommandGroup(false);
  const action = interaction.options.getSubcommand(true);
  const wantsPublic = action === "summary" && interaction.options.getBoolean("public") === true;
  const staffAction = group === "feature" || action === "status" || action === "panel" || wantsPublic;
  const visibility: Visibility = wantsPublic ? {} : { flags: MessageFlags.Ephemeral };

  if (!service || !interaction.guildId) {
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }
  if (staffAction && !isSuggestionStaff(interaction)) {
    await interaction.reply({ content: wantsPublic ? "Only staff can post a summary publicly. Leave `public` off to see it yourself." : "Only staff can manage suggestion statuses and features.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply(visibility);

  try {
    if (group === "feature") {
      await runFeatureAction(interaction, service, action);
      return;
    }
    const thread = await resolvePost(interaction, service);
    if (!thread) {
      await interaction.editReply({ content: NOT_A_POST });
      return;
    }
    if (action === "similar") {
      await interaction.editReply({ components: [createSimilarPanel(thread.name, await service.relatedForThread(thread))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    } else if (action === "summary") {
      await interaction.editReply({ components: [createSummaryPanel(thread.name, await service.summarize(thread))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    } else if (action === "status") {
      const status = interaction.options.getString("status", true);
      if (!isSuggestionStatus(status)) throw new SuggestionError("Unknown status.");
      await service.setStatus(thread, status, { actorId: interaction.user.id, note: interaction.options.getString("note")?.trim() || undefined });
      await interaction.editReply({ content: `<#${thread.id}> is now **${statusLabel(status)}**.`, allowedMentions: { parse: [] } });
    } else if (action === "panel") {
      await service.ensurePanel(thread, interaction.user.id);
      await interaction.editReply({ content: `The assistant panel in <#${thread.id}> is up to date.`, allowedMentions: { parse: [] } });
    }
  } catch (error: unknown) {
    if (!(error instanceof SuggestionError)) interaction.client.logger.error("Suggestion command failed.", error);
    await interaction.editReply({ content: safeMessage(error), components: [], allowedMentions: { parse: [] } });
  }
}

async function runFeatureAction(interaction: ChatInputCommandInteraction, service: SuggestionService, action: string): Promise<void> {
  const guildId = interaction.guildId!;
  if (action === "start") {
    const name = interaction.options.getString("name", true).trim();
    const keywords = interaction.options.getString("keywords")?.trim() ?? "";
    const reference = parseReferenceUrl(interaction.options.getString("reference"));
    const { feature, candidates } = await service.startFeature(guildId, name, keywords, reference, interaction.user.id);
    await interaction.editReply({ components: [createFeatureMatchPanel(feature, candidates, interaction.user.id)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    return;
  }
  if (action === "list") {
    await interaction.editReply({ components: [createFeatureListPanel(await service.listFeatures(guildId))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    return;
  }
  const featureId = interaction.options.getString("feature", true);
  if (action === "link") {
    const thread = await resolvePost(interaction, service);
    if (!thread) throw new SuggestionError("Pick a post from the suggestions forum.");
    const { feature, outcomes } = await service.linkThreads(guildId, featureId, [thread.id], interaction.user.id);
    await interaction.editReply({ components: [createOutcomePanel("Suggestion linked", `Linked to **${escapeMarkdown(feature.name)}** and moved to ${statusLabel("in_progress")}.`, outcomes)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    return;
  }
  const reference = parseReferenceUrl(interaction.options.getString("reference"));
  const note = interaction.options.getString("note")?.trim() || undefined;
  const { feature, outcomes } = await service.shipFeature(guildId, featureId, reference, note, interaction.user.id);
  const intro = outcomes.length ? `**${escapeMarkdown(feature.name)}** is marked as added. Linked suggestions:` : `**${escapeMarkdown(feature.name)}** is marked as added. No suggestions were linked to it.`;
  await interaction.editReply({ components: [createOutcomePanel("Feature added", intro, outcomes)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
}

async function autocompleteSuggestionFeature(interaction: AutocompleteInteraction): Promise<void> {
  const service = interaction.client.suggestions;
  if (!service || !interaction.guildId || !isSuggestionStaff(interaction)) {
    await interaction.respond([]);
    return;
  }
  const action = interaction.options.getSubcommand(false);
  const features = await service.listFeatures(interaction.guildId, String(interaction.options.getFocused()), 25).catch(() => []);
  await interaction.respond(features
    .filter((feature) => action !== "link" || feature.status === "in_progress")
    .map((feature) => ({ name: `${feature.name}${feature.status === "implemented" ? " (added)" : ""}`.slice(0, 100), value: feature.id })));
}

async function handleStatusButton(interaction: ButtonInteraction): Promise<void> {
  const service = interaction.client.suggestions;
  const status = interaction.customId.match(STATUS_BUTTON_PATTERN)?.[1] ?? "";
  if (!service || !isSuggestionStatus(status)) {
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isSuggestionStaff(interaction)) {
    await interaction.reply({ content: STAFF_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const thread = interaction.channel;
  if (!service.isSuggestionThread(thread)) {
    await interaction.reply({ content: "This panel is not inside a suggestion post anymore.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await service.setStatus(thread, status, { actorId: interaction.user.id });
    await interaction.editReply({ content: `Done. This suggestion is now **${statusLabel(status)}**, and the suggester was told: ${STATUS_DEFINITIONS[status].notice}` });
  } catch (error: unknown) {
    if (!(error instanceof SuggestionError)) interaction.client.logger.error("Suggestion status button failed.", error);
    await interaction.editReply({ content: safeMessage(error) });
  }
}

/** A status button on a suggestion's panel in the staff channel: changes the post without opening it. */
async function handleStaffStatusButton(interaction: ButtonInteraction): Promise<void> {
  const service = interaction.client.suggestions;
  const [, status = "", threadId = ""] = interaction.customId.match(STAFF_STATUS_PATTERN) ?? [];
  if (!service || !isSuggestionStatus(status) || !service.config.staffChannelId) {
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.channelId !== service.config.staffChannelId || !isSuggestionStaff(interaction)) {
    await interaction.reply({ content: STAFF_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const thread = await interaction.client.channels.fetch(threadId).catch(() => null);
  if (!service.isSuggestionThread(thread)) {
    await interaction.editReply({ content: "That suggestion post no longer exists." });
    return;
  }
  try {
    await service.setStatus(thread, status, { actorId: interaction.user.id });
    await interaction.editReply({ content: `Done. <#${thread.id}> is now **${statusLabel(status)}**, and the suggester was told: ${STATUS_DEFINITIONS[status].notice}`, allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    if (!(error instanceof SuggestionError)) interaction.client.logger.error("Suggestion staff panel button failed.", error);
    await interaction.editReply({ content: safeMessage(error) });
  }
}

async function handleToolButton(interaction: ButtonInteraction, tool: "summary" | "similar"): Promise<void> {
  const service = interaction.client.suggestions;
  const thread = interaction.channel;
  if (!service || !service.isSuggestionThread(thread)) {
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const panel = tool === "summary" ? createSummaryPanel(thread.name, await service.summarize(thread)) : createSimilarPanel(thread.name, await service.relatedForThread(thread));
    await interaction.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    if (!(error instanceof SuggestionError)) interaction.client.logger.error("Suggestion tool button failed.", error);
    await interaction.editReply({ content: safeMessage(error) });
  }
}

async function handleFeatureMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const service = interaction.client.suggestions;
  const match = interaction.customId.match(FEATURE_MENU_PATTERN);
  if (!service || !match || !interaction.guildId) {
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }
  const [, featureId, requesterId] = match;
  if (requesterId !== interaction.user.id) {
    await interaction.reply({ content: "Only the staff member who started this feature can use this menu.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (Date.now() - interaction.message.createdTimestamp > FEATURE_SESSION_MS) {
    await interaction.reply({ content: "This selection expired. Link posts with `/suggestions feature link`.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isSuggestionStaff(interaction)) {
    await interaction.reply({ content: STAFF_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  try {
    const { feature, outcomes } = await service.linkThreads(interaction.guildId, featureId!, interaction.values, interaction.user.id);
    await interaction.editReply({ components: [createOutcomePanel("Suggestions linked", `Linked to **${escapeMarkdown(feature.name)}** and moved to ${statusLabel("in_progress")}.`, outcomes)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    if (!(error instanceof SuggestionError)) interaction.client.logger.error("Suggestion feature menu failed.", error);
    await interaction.followUp({ content: safeMessage(error), flags: MessageFlags.Ephemeral });
  }
}

export {
  FEATURE_MENU_PATTERN, FEATURE_MENU_PREFIX, FEATURE_SESSION_MS, STAFF_STATUS_PATTERN, STATUS_BUTTON_PATTERN, STATUS_BUTTON_PREFIX,
  autocompleteSuggestionFeature, executeSuggestionsCommand, handleFeatureMenu, handleStaffStatusButton, handleStatusButton, handleToolButton, parseReferenceUrl,
};
