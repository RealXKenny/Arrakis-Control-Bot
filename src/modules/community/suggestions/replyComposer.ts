import { escapeMarkdown } from "discord.js";
import { splitSentences } from "./discussionSummary";
import { tokenize } from "./textAnalysis";
import { CATEGORY_TAG_NAMES, type SuggestionCategory, type SuggestionStatus } from "./suggestionTags";

/**
 * The assistant's voice. Replies are composed from small phrase banks, the suggestion's own
 * topic and the discussion's signals, then picked with a seeded generator so each post gets
 * its own wording while tests stay deterministic. No model download and no network call.
 */

interface ReplyContext {
  /** Stable per post and event, such as `${threadId}:${status}:${count}`. */
  seed: string;
  title: string;
  body?: string;
  authorId?: string;
  categories?: readonly SuggestionCategory[];
  supportCount?: number;
  participantCount?: number;
  relatedCount?: number;
  /** Title of a very close earlier post, named in the reply. */
  closestTitle?: string;
  note?: string;
  featureName?: string;
  referenceUrl?: string;
  /** Staff member who changed the status. */
  actorId?: string;
  /** GitHub work that moved the status, when the autopilot made the change. */
  evidence?: ReplyEvidence;
}

interface ReplyEvidence {
  kind: "issue" | "pull" | "commit" | "release";
  title: string;
  url: string;
}

type Bank = readonly string[];

const CATEGORY_AREAS: Readonly<Record<SuggestionCategory, string>> = Object.freeze({
  idea: "the community", game: "gameplay", server: "the server setup", bots: "the bot", events: "community events", rules: "the server rules", cosmetic: "the look of the server",
});

const NEW_POST_OPENERS: Bank = [
  "Thanks for the suggestion, {author}. I read through your post about {topic}.",
  "Got it, {author}. Your idea about {topic} is logged.",
  "Thanks, {author}. A suggestion about {topic} is a good one to talk through.",
  "Appreciate you posting this, {author}. I've taken a look at {topic}.",
  "Thanks for writing this up, {author}. {Topic} is now on the staff's radar.",
];
const NEW_POST_FILED: Bank = [
  "I filed it under {categories} so the right people see it.",
  "It looks like a fit for {categories}, so I tagged it that way.",
  "I tagged it {categories}; staff can change that if I guessed wrong.",
  "Based on what you wrote, it belongs under {categories}.",
];
const NEW_POST_RELATED: Bank = [
  "There are similar posts below. If one matches, adding to it keeps the discussion in one place.",
  "A few earlier posts look related, so check them below before the discussion splits.",
  "I found posts that talk about something close to this. They're listed below.",
];
const NEW_POST_DETAIL: Bank = [
  "The part about “{detail}” is the kind of detail that helps staff picture it.",
  "I noted this bit in particular: “{detail}”.",
  "“{detail}” sums it up nicely.",
  "Key point, as I read it: “{detail}”.",
];
const NEW_POST_CLOSEST: Bank = [
  "The closest is **{closest}**, so take a look there too.",
  "**{closest}** reads almost the same, so it may be worth joining forces.",
];
/** Asked when a post is short, so the suggester knows what would help. */
const FOLLOW_UP_QUESTIONS: Readonly<Record<SuggestionCategory, Bank>> = Object.freeze({
  idea: ["What problem would this solve for you?", "Could you add an example of how it would work?", "Who would use this the most?"],
  game: ["How would this change a normal play session?", "Is there a game or server that does this well already?", "Would this be for solo players, groups or everyone?"],
  server: ["Is this about performance, settings or something else?", "When do you notice the problem most?", "Which setting would you change, and to what?"],
  bots: ["Which command or panel would this change?", "How would you expect the bot to respond?", "Could you describe the steps you'd take with it?"],
  events: ["How often would you like this event to run?", "What would a winner get?", "Would this suit a weekend or a weeknight?"],
  rules: ["What situation made you think of this rule?", "How would staff enforce it fairly?", "What should happen when someone breaks it?"],
  cosmetic: ["Do you have a picture or example of the look you mean?", "Where would this show up?", "Which colours or style did you have in mind?"],
});
const SHORT_POST_LINES: Bank = [
  "It's a short post, so a bit more detail would help:",
  "One question to make this stronger:",
  "To help staff weigh it up:",
];

const NEW_POST_CLOSERS: Bank = [
  "Members can add their thoughts below, and staff will review it soon.",
  "Feel free to add details or examples while staff review it.",
  "Others can weigh in below. A clear reason why it helps goes a long way.",
  "Staff will take a look. Upvotes and replies help show how much people want it.",
];

const STATUS_OPENERS: Readonly<Record<SuggestionStatus, Bank>> = Object.freeze({
  under_review: [
    "{Author}, your suggestion about {topic} is back under review.",
    "Staff are taking another look at {topic}, {author}.",
    "Quick update, {author}: {topic} is being reviewed again.",
  ],
  planned: [
    "Good news, {author}. Your suggestion about {topic} is planned.",
    "{Author}, {topic} made the list. Staff plan to work on it.",
    "Update for {author}: {topic} is now planned.",
    "Staff liked this one, {author}. {Topic} is planned.",
  ],
  in_progress: [
    "{Author}, work on {topic} has started.",
    "Heads up, {author}: {topic} is being worked on now.",
    "Your suggestion about {topic} is in progress, {author}.",
    "{Topic} is underway, {author}. Staff started working on it.",
  ],
  back_burner: [
    "{Author}, {topic} is on the back burner for now.",
    "Update for {author}: {topic} is on hold, not ruled out.",
    "{Topic} is parked for the moment, {author}. It can come back later.",
  ],
  not_doing: [
    "Thanks for the suggestion, {author}. Staff decided not to go ahead with {topic}.",
    "{Author}, after looking at {topic}, staff won't be doing this one.",
    "Update for {author}: {topic} won't be added.",
  ],
  implemented: [
    "{Author}, your suggestion about {topic} has been added.",
    "It's done, {author}. {Topic} is live.",
    "Good news, {author}: {topic} is in.",
    "{Topic} has been added, {author}. Thanks for suggesting it.",
  ],
});

const STATUS_FOLLOW_UPS: Readonly<Record<SuggestionStatus, Bank>> = Object.freeze({
  under_review: ["Extra details in this thread help the review.", "If anything changed since you posted, add it below."],
  planned: ["It isn't started yet, but it is on the way.", "There's no date yet; this thread will be updated when work starts.", "Keep the ideas coming below; they can shape how it's built."],
  in_progress: ["This thread will be updated when it's ready.", "Feedback below is still welcome while it's being built.", "Watch this thread for the next update."],
  back_burner: ["Other work comes first right now, and this can be picked up again later.", "Upvotes and new reasons below can help bring it back.", "It's saved and can return to the plan later."],
  not_doing: ["The discussion stays open so people can still share their views.", "Ideas that build on it are still welcome in a new post.", "Thanks for taking the time to suggest it."],
  implemented: ["Thanks for helping improve {area}.", "Let staff know below if something isn't working as expected.", "Ideas like this help improve {area}. Thanks for posting it."],
});

/** Openers for moves the assistant made itself from GitHub activity. */
const AUTO_OPENERS: Readonly<Partial<Record<SuggestionStatus, Bank>>> = Object.freeze({
  planned: [
    "{Author}, I noticed {topic} on the development to-do list, so it's now planned.",
    "Good news, {author}. {Topic} showed up in the project's planned work.",
    "I spotted a matching task for {topic}, {author}, so I moved this to planned.",
  ],
  in_progress: [
    "{Author}, I spotted code being written for {topic}, so this is now in progress.",
    "Work on {topic} has started, {author}. I saw it come up in the code.",
    "Heads up, {author}: {topic} is being built right now, so I moved it to in progress.",
    "{Topic} is in the works, {author}. I found matching changes in the code.",
  ],
  implemented: [
    "{Author}, {topic} shipped in the latest release, so I marked it as added.",
    "It's out, {author}. {Topic} was included in a release.",
    "Good news, {author}: {topic} made it into a release and is now live.",
    "{Topic} has been released, {author}. Thanks for suggesting it.",
  ],
});

const EVIDENCE_LINES: Readonly<Record<ReplyEvidence["kind"], Bank>> = Object.freeze({
  issue: ["Tracked here: {evidence}", "Planned work: {evidence}", "You can follow it here: {evidence}"],
  pull: ["The change: {evidence}", "Follow the work here: {evidence}", "Work in progress: {evidence}"],
  commit: ["Latest change: {evidence}", "Spotted in this change: {evidence}", "Code change: {evidence}"],
  release: ["Release notes: {evidence}", "Shipped in {evidence}", "Included in {evidence}"],
});

const SUPPORT_LINES: Bank = [
  "{support} members backed it, and that helped.",
  "With {support} members in favour, it was an easy one to notice.",
  "The {support} members who supported it made a difference.",
];

const STATUS_MARKERS: Readonly<Record<SuggestionStatus, string>> = Object.freeze({
  under_review: "🔍", planned: "📋", in_progress: "🔨", back_burner: "⏸️", not_doing: "❌", implemented: "✅",
});

/** FNV-1a hash feeding a small xorshift generator: same seed, same reply. */
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function pick(bank: Bank, random: () => number): string {
  return bank[Math.floor(random() * bank.length)] ?? bank[0] ?? "";
}

/** A short, readable topic from the post title, falling back to its strongest words. */
function extractTopic(title: string, body = ""): string {
  const cleaned = title.replace(/\s+/g, " ").replace(/^(suggestion|idea|request)\s*[:\-–]\s*/i, "").replace(/[.!?:;,]+$/, "").trim();
  if (cleaned.length >= 3 && tokenize(cleaned).length > 0) {
    const clipped = Array.from(cleaned).length > 60 ? `${Array.from(cleaned).slice(0, 57).join("").trimEnd()}…` : cleaned;
    return `**${escapeMarkdown(clipped)}**`;
  }
  const words = [...new Set(tokenize(body))].slice(0, 3);
  return words.length ? `**${escapeMarkdown(words.join(" "))}**` : "this suggestion";
}

function formatCategories(categories: readonly SuggestionCategory[]): string {
  const names = categories.map((category) => `**${CATEGORY_TAG_NAMES[category]}**`);
  if (names.length <= 1) return names[0] ?? "**Idea**";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function fill(template: string, context: ReplyContext, topic: string): string {
  const author = context.authorId ? `<@${context.authorId}>` : "everyone";
  const area = CATEGORY_AREAS[context.categories?.[0] ?? "idea"];
  return template
    .replaceAll("{Author}", context.authorId ? author : "Everyone")
    .replaceAll("{author}", author)
    .replaceAll("{Topic}", topic.startsWith("**") ? topic : capitalize(topic))
    .replaceAll("{topic}", topic)
    .replaceAll("{categories}", formatCategories(context.categories ?? ["idea"]))
    .replaceAll("{area}", area)
    .replaceAll("{support}", String(context.supportCount ?? 0));
}

function truncate(value: string, maximum: number): string {
  const characters = Array.from(value.trim());
  return characters.length > maximum ? `${characters.slice(0, maximum - 1).join("").trimEnd()}…` : characters.join("");
}

function capitalize(value: string): string {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

const SHORT_POST_TOKENS = 12;

/** The sentence of the post that says the most beyond its title, quoted back so the reply shows it was read. */
function keyDetail(title: string, body: string): string | undefined {
  const titleTerms = new Set(tokenize(title));
  let best: { text: string; score: number } | undefined;
  for (const sentence of splitSentences(body)) {
    const terms = new Set(tokenize(sentence));
    if (terms.size < 4 || /https?:\/\//.test(sentence)) continue;
    let fresh = 0;
    for (const term of terms) if (!titleTerms.has(term)) fresh += 1;
    const score = fresh + Math.min(terms.size, 12) / 4;
    if (fresh >= 2 && (!best || score > best.score)) best = { text: sentence, score };
  }
  return best ? truncate(best.text.replace(/<[@#][!&]?\d+>/g, "").replace(/[{}]/g, "").replace(/[“”"]/g, "'").replace(/[.!?]+$/, ""), 110) : undefined;
}

/** Reply posted under a brand-new suggestion. */
function composeNewPostReply(context: ReplyContext): string {
  const random = seededRandom(`new:${context.seed}`);
  const topic = extractTopic(context.title, context.body);
  const lines = [pick(NEW_POST_OPENERS, random)];
  const detail = keyDetail(context.title, context.body ?? "");
  if (detail) lines.push(pick(NEW_POST_DETAIL, random).replace("{detail}", () => escapeMarkdown(detail)));
  lines.push(pick(NEW_POST_FILED, random));
  if ((context.relatedCount ?? 0) > 0) {
    lines.push(pick(NEW_POST_RELATED, random));
    if (context.closestTitle) lines.push(pick(NEW_POST_CLOSEST, random).replace("{closest}", () => escapeMarkdown(truncate(context.closestTitle!, 70))));
  }
  if (tokenize(context.body ?? "").length < SHORT_POST_TOKENS) {
    lines.push(`${pick(SHORT_POST_LINES, random)} ${pick(FOLLOW_UP_QUESTIONS[context.categories?.[0] ?? "idea"], random)}`);
  } else {
    lines.push(pick(NEW_POST_CLOSERS, random));
  }
  return lines.map((line) => fill(line, context, topic)).join(" ");
}

/** Reply posted in a suggestion when staff change its status. */
function composeStatusReply(status: SuggestionStatus, context: ReplyContext): string {
  const random = seededRandom(`${status}:${context.seed}`);
  const topic = extractTopic(context.title, context.body);
  const sentences = [pick((context.evidence && AUTO_OPENERS[status]) || STATUS_OPENERS[status], random)];
  if ((context.supportCount ?? 0) >= 3 && (status === "planned" || status === "in_progress" || status === "implemented")) sentences.push(pick(SUPPORT_LINES, random));
  sentences.push(pick(STATUS_FOLLOW_UPS[status], random));
  const paragraphs = [`${STATUS_MARKERS[status]} ${sentences.map((line) => fill(line, context, topic)).join(" ")}`];
  if (context.featureName) paragraphs.push(`Part of the **${escapeMarkdown(context.featureName)}** work.`);
  if (context.note) paragraphs.push(`> ${escapeMarkdown(context.note).replace(/\n+/g, " ")}${context.actorId ? `\n-# Note from <@${context.actorId}>` : ""}`);
  if (context.evidence) {
    const link = `[${escapeMarkdown(truncate(context.evidence.title.replace(/[[\]]/g, ""), 90))}](<${context.evidence.url}>)`;
    paragraphs.push(`-# ${pick(EVIDENCE_LINES[context.evidence.kind], random).replace("{evidence}", () => link)}`);
  }
  if (context.referenceUrl) paragraphs.push(`More details: ${context.referenceUrl}`);
  return paragraphs.join("\n\n");
}

export { STATUS_MARKERS, composeNewPostReply, composeStatusReply, extractTopic, formatCategories, seededRandom };
export type { ReplyContext, ReplyEvidence };
