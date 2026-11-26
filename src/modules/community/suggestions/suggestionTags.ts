/**
 * Forum tag vocabulary for the suggestion assistant: the category tags the classifier
 * chooses from, and the status tags the staff panel moves a post through.
 */

const SUGGESTION_CATEGORIES = ["idea", "game", "server", "bots", "events", "rules", "cosmetic"] as const;
type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

const SUGGESTION_STATUSES = ["under_review", "planned", "in_progress", "back_burner", "not_doing", "implemented"] as const;
type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** Discord allows at most five applied tags per forum post. */
const MAX_APPLIED_TAGS = 5;

const CATEGORY_TAG_NAMES: Readonly<Record<SuggestionCategory, string>> = Object.freeze({
  idea: "Idea", game: "Game", server: "Server", bots: "Bots", events: "Events", rules: "Rules", cosmetic: "Cosmetic",
});

interface StatusDefinition {
  /** Forum tag name. Missing tags are created with this name. */
  tagName: string;
  /** Alternative tag names that already mean this status. */
  aliases: readonly string[];
  /** Short label on the staff buttons and panel. */
  label: string;
  /** Sentence posted in the thread when a post moves to this status. */
  notice: string;
}

const STATUS_DEFINITIONS: Readonly<Record<SuggestionStatus, StatusDefinition>> = Object.freeze({
  under_review: { tagName: "Under Review", aliases: ["Reviewing", "Pending"], label: "Under review", notice: "This suggestion is waiting for staff review." },
  planned: { tagName: "Planned", aliases: ["Accepted"], label: "Planned", notice: "Staff plan to work on this suggestion." },
  in_progress: { tagName: "In Progress", aliases: ["Working On", "Working On It"], label: "Working on it", notice: "Work on this suggestion has started." },
  back_burner: { tagName: "Back Burner", aliases: ["Backburner", "On Hold", "Later"], label: "Back burner", notice: "This suggestion is on hold for now. It is not ruled out." },
  not_doing: { tagName: "Not Doing", aliases: ["Declined", "Denied", "Rejected", "Wont Do"], label: "Not doing", notice: "Staff decided not to go ahead with this suggestion." },
  implemented: { tagName: "Implemented", aliases: ["Added", "Done", "Completed"], label: "Added", notice: "This suggestion has been added." },
});

/** Statuses the staff panel offers as buttons, in display order. Under review is the starting state. */
const PANEL_STATUSES: readonly SuggestionStatus[] = ["planned", "in_progress", "back_burner", "not_doing", "implemented"];

/** Tags that keep their meaning beside a status and are left alone, except where noted. */
const APPROVED_TAG_NAME = "Approved";

interface ForumTagLike {
  id: string;
  name: string;
}

interface ResolvedForumTags {
  categories: ReadonlyMap<SuggestionCategory, string>;
  statuses: ReadonlyMap<SuggestionStatus, string>;
  categoryByTagId: ReadonlyMap<string, SuggestionCategory>;
  statusByTagId: ReadonlyMap<string, SuggestionStatus>;
  approvedTagId?: string;
}

function tagKey(name: string): string {
  return name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveForumTags(tags: readonly ForumTagLike[]): ResolvedForumTags {
  const byKey = new Map<string, string>();
  for (const tag of tags) if (!byKey.has(tagKey(tag.name))) byKey.set(tagKey(tag.name), tag.id);

  const categories = new Map<SuggestionCategory, string>();
  const categoryByTagId = new Map<string, SuggestionCategory>();
  for (const category of SUGGESTION_CATEGORIES) {
    const id = byKey.get(tagKey(CATEGORY_TAG_NAMES[category]));
    if (!id) continue;
    categories.set(category, id);
    categoryByTagId.set(id, category);
  }

  const statuses = new Map<SuggestionStatus, string>();
  const statusByTagId = new Map<string, SuggestionStatus>();
  for (const status of SUGGESTION_STATUSES) {
    const definition = STATUS_DEFINITIONS[status];
    const id = [definition.tagName, ...definition.aliases].map((name) => byKey.get(tagKey(name))).find((value): value is string => Boolean(value));
    if (!id || statusByTagId.has(id)) continue;
    statuses.set(status, id);
    statusByTagId.set(id, status);
  }

  return { categories, statuses, categoryByTagId, statusByTagId, approvedTagId: byKey.get(tagKey(APPROVED_TAG_NAME)) };
}

/** Status tags missing from the forum, by the name they should be created with. */
function missingStatusTagNames(tags: readonly ForumTagLike[]): string[] {
  const resolved = resolveForumTags(tags);
  return SUGGESTION_STATUSES.filter((status) => !resolved.statuses.has(status)).map((status) => STATUS_DEFINITIONS[status].tagName);
}

function currentStatus(appliedTagIds: readonly string[], tags: ResolvedForumTags): SuggestionStatus | undefined {
  for (const id of appliedTagIds) {
    const status = tags.statusByTagId.get(id);
    if (status) return status;
  }
  return undefined;
}

/**
 * Replace the post's status tag. Category and unrelated tags stay; Approved is dropped only
 * when a post goes back to review or is ruled out. The status always fits in Discord's limit.
 */
function withStatus(appliedTagIds: readonly string[], status: SuggestionStatus, tags: ResolvedForumTags): string[] {
  const target = tags.statuses.get(status);
  const dropApproved = status === "not_doing" || status === "under_review";
  const kept = appliedTagIds.filter((id) => !tags.statusByTagId.has(id) && !(dropApproved && id === tags.approvedTagId));
  if (!target) return kept.slice(0, MAX_APPLIED_TAGS);
  return [target, ...kept].slice(0, MAX_APPLIED_TAGS);
}

/** Add category tags (most confident first) without removing anything already applied. */
function withCategories(appliedTagIds: readonly string[], categories: readonly SuggestionCategory[], tags: ResolvedForumTags): string[] {
  const next = [...appliedTagIds];
  for (const category of categories) {
    const id = tags.categories.get(category);
    if (!id || next.includes(id) || next.length >= MAX_APPLIED_TAGS) continue;
    next.push(id);
  }
  return next;
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function isSuggestionStatus(value: string): value is SuggestionStatus {
  return (SUGGESTION_STATUSES as readonly string[]).includes(value);
}

export {
  APPROVED_TAG_NAME, CATEGORY_TAG_NAMES, MAX_APPLIED_TAGS, PANEL_STATUSES, STATUS_DEFINITIONS, SUGGESTION_CATEGORIES, SUGGESTION_STATUSES,
  currentStatus, isSuggestionStatus, missingStatusTagNames, resolveForumTags, sameTags, tagKey, withCategories, withStatus,
};
export type { ForumTagLike, ResolvedForumTags, StatusDefinition, SuggestionCategory, SuggestionStatus };
