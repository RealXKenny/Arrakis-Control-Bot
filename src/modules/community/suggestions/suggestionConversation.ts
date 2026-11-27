import { escapeMarkdown } from "discord.js";
import { describeDiscussion, type DiscussionSummary } from "./discussionSummary";
import { STATUS_MARKERS, extractTopic, seededRandom } from "./replyComposer";
import type { SuggestionStatus } from "./suggestionTags";

/**
 * Lets members talk to the assistant inside a suggestion post. A small rule-based intent
 * reader works out what they are asking, and the answer is built from what the assistant
 * actually knows about the post: its status, linked GitHub work, similar posts and the
 * discussion. Nothing is made up, and nothing leaves the bot.
 */

type ConversationIntent = "status" | "similar" | "summary" | "help" | "thanks" | "greeting" | "opinion" | "unknown";

interface ConversationWork {
  kind: string;
  title: string;
  url: string;
}

interface ConversationRelated {
  threadId: string;
  title: string;
}

interface ConversationContext {
  seed: string;
  askerId: string;
  title: string;
  body?: string;
  authorId?: string;
  status?: SuggestionStatus;
  work: readonly ConversationWork[];
  related: readonly ConversationRelated[];
  summary?: DiscussionSummary;
}

type Bank = readonly string[];

const INTENT_PATTERNS: readonly [ConversationIntent, RegExp][] = [
  ["summary", /\b(summar(y|ize|ise)|sum (it )?up|tl;?dr|recap|catch me up|what did (i|we) miss|what are people saying)\b/i],
  ["similar", /\b(similar|duplicate|dupe|already (been )?(suggested|posted|asked)|same (idea|thing|suggestion)|related posts?)\b/i],
  ["status", /\b(status|eta|when|how long|any (news|update|progress)|update\??$|progress|being (worked|made|built)|working on|is (it|this) (coming|planned|happening|added|done|out|live)|will (it|this) (be|get|come)|planned|released?)\b/i],
  ["opinion", /\b(what do you think|your (opinion|thoughts|take)|do you (like|think)|good idea\?|is (it|this) a good)\b/i],
  ["help", /\b(help|what can you do|how do(es)? (you|this|it) work|commands?|who are you|what are you)\b/i],
  ["thanks", /\b(thanks?|thank you|thx|ty|cheers|appreciate (it|you)|good bot|nice work)\b/i],
  ["greeting", /^\W*(hi|hey|hello|yo|sup|howdy|good (morning|evening|afternoon))\b/i],
];

const WORK_NAMES: Readonly<Record<string, string>> = Object.freeze({ issue: "an issue", pull: "a pull request", commit: "a code change", release: "a release" });

const STATUS_ANSWERS: Readonly<Record<SuggestionStatus, Bank>> = Object.freeze({
  under_review: [
    "{asker}, {topic} is still under review. Staff haven't decided yet, and I haven't seen any matching work on GitHub.",
    "Nothing has been decided on {topic} yet, {asker}. It's waiting for staff review.",
    "{asker}, {topic} hasn't been picked up yet. It's under review, and I'll post here the moment that changes.",
  ],
  planned: [
    "{asker}, {topic} is planned. Work hasn't started, so there's no date yet.",
    "It's on the list, {asker}. {Topic} is planned but not being built yet.",
    "{Topic} is planned, {asker}. I'll post here as soon as I see work start on it.",
  ],
  in_progress: [
    "{asker}, {topic} is being worked on right now.",
    "Work on {topic} is underway, {asker}. I'll post here when it ships.",
    "{Topic} is in progress, {asker}. It isn't released yet, but it's moving.",
  ],
  back_burner: [
    "{asker}, {topic} is on the back burner. It's not ruled out, just not a priority right now.",
    "{Topic} is on hold for now, {asker}. More support and good reasons here can help bring it back.",
  ],
  not_doing: [
    "{asker}, staff decided not to go ahead with {topic}. The thread stays open for discussion.",
    "{Topic} won't be added, {asker}. If you have a different take on it, a new post is welcome.",
  ],
  implemented: [
    "Good news, {asker}: {topic} has already been added.",
    "{Topic} is done and live, {asker}.",
    "{asker}, {topic} shipped already. If something isn't working, say so here.",
  ],
});

const NO_DATES: Bank = [
  "I can't promise dates, but I watch the GitHub repositories and post here as soon as anything changes.",
  "I don't have a date, but this thread gets an update the moment I spot new work.",
  "There's no exact date, but I check for new work regularly and will update this thread.",
];

const HELP: Bank = [
  "I'm the suggestion assistant, {asker}. Mention me here and ask things like \"any update?\", \"is this a duplicate?\" or \"sum it up\". I also tag new posts, find similar ones, and move suggestions along by myself when I see matching work on GitHub.",
  "Hi {asker}. I keep this forum tidy: I tag posts, spot duplicates, summarize long threads and follow the GitHub repositories, so statuses update by themselves. Ask me for an update, similar posts or a summary.",
];

const THANKS: Bank = ["Any time, {asker}.", "Happy to help, {asker}.", "You're welcome, {asker}. I'll keep an eye on this one.", "No problem, {asker}."];
const GREETINGS: Bank = ["Hey {asker}. Ask me for an update, a summary or similar posts.", "Hi {asker}. Want an update on {topic}, a summary, or similar posts?", "Hello {asker}. I'm watching {topic}; ask me anything about where it stands."];
const UNKNOWN: Bank = [
  "I'm not sure what you mean, {asker}. I can give an update on {topic}, sum up the discussion, or find similar posts.",
  "I didn't quite catch that, {asker}. Try \"any update?\", \"sum it up\" or \"similar posts\".",
  "Sorry {asker}, that's outside what I know. Ask me where {topic} stands, for a summary, or for similar posts.",
];

/** What a member wants from the assistant, read from their message. */
function detectIntent(text: string): ConversationIntent {
  const cleaned = text.replace(/<@!?\d+>/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "greeting";
  for (const [intent, pattern] of INTENT_PATTERNS) if (pattern.test(cleaned)) return intent;
  return "unknown";
}

function pick(bank: Bank, random: () => number): string {
  return bank[Math.floor(random() * bank.length)] ?? bank[0] ?? "";
}

function fill(template: string, context: ConversationContext, topic: string): string {
  return template
    .replaceAll("{asker}", `<@${context.askerId}>`)
    .replaceAll("{Topic}", topic)
    .replaceAll("{topic}", topic);
}

function workLine(work: ConversationWork): string {
  const title = escapeMarkdown(Array.from(work.title.replace(/[[\]]/g, "")).slice(0, 80).join(""));
  return `${WORK_NAMES[work.kind] ?? "a link"}: [${title}](<${work.url}>)`;
}

function answerStatus(context: ConversationContext, random: () => number, topic: string): string[] {
  const status = context.status ?? "under_review";
  const lines = [`${STATUS_MARKERS[status]} ${fill(pick(STATUS_ANSWERS[status], random), context, topic)}`];
  const [latest, ...older] = context.work;
  if (latest) lines.push(`The latest I've seen is ${workLine(latest)}${older.length ? `, plus ${older.length} earlier ${older.length === 1 ? "item" : "items"}` : ""}.`);
  if (status === "planned" || status === "in_progress" || status === "under_review") lines.push(pick(NO_DATES, random));
  return lines;
}

function answerSimilar(context: ConversationContext, random: () => number): string[] {
  if (!context.related.length) return [fill(pick(["I couldn't find anything close to this, {asker}. It looks like a new idea.", "No look-alikes that I can see, {asker}. This one seems original."], random), context, "")];
  const links = context.related.slice(0, 3).map((post) => `- <#${post.threadId}> (${escapeMarkdown(Array.from(post.title).slice(0, 80).join(""))})`);
  const intro = fill(pick(["{asker}, these read a lot like this one:", "Here's what looks closest, {asker}:", "{asker}, I found posts that cover similar ground:"], random), context, "");
  return [intro, ...links, pick(["If one is the same idea, adding to it keeps the votes in one place.", "Worth a look before the discussion splits in two."], random)];
}

function answerSummary(context: ConversationContext, random: () => number): string[] {
  const summary = context.summary;
  if (!summary || summary.messageCount === 0) return [fill(pick(["There isn't much to sum up yet, {asker}. Nobody else has replied.", "{asker}, the discussion hasn't really started, so there's nothing to recap."], random), context, "")];
  const lines = [`${fill(pick(["Here's the gist, {asker}.", "Quick recap, {asker}.", "{asker}, in short:"], random), context, "")} ${describeDiscussion(summary)}`];
  const point = summary.keyPoints[0];
  if (point) lines.push(`> ${escapeMarkdown(point.text)}\n-# <@${point.authorId}>`);
  return lines;
}

function answerOpinion(context: ConversationContext, random: () => number, topic: string): string[] {
  const summary = context.summary;
  const support = summary?.supportCount ?? 0;
  const oppose = summary?.opposeCount ?? 0;
  const mood = support > oppose
    ? `Going by the thread, people like it: ${support} for and ${oppose} against.`
    : oppose > support
      ? `The thread leans against it so far: ${oppose} against and ${support} for.`
      : "The thread hasn't made up its mind yet.";
  const opener = pick(["I don't pick sides, {asker}; staff decide.", "My job is to keep track, not to vote, {asker}.", "I stay neutral on {topic}, {asker}."], random);
  return [`${fill(opener, context, topic)} ${mood}`];
}

/** The assistant's answer to a member who mentioned it or replied to it in a suggestion post. */
function composeConversationReply(intent: ConversationIntent, context: ConversationContext): string {
  const random = seededRandom(`talk:${intent}:${context.seed}`);
  const topic = extractTopic(context.title, context.body);
  let lines: string[];
  switch (intent) {
    case "status": lines = answerStatus(context, random, topic); break;
    case "similar": lines = answerSimilar(context, random); break;
    case "summary": lines = answerSummary(context, random); break;
    case "opinion": lines = answerOpinion(context, random, topic); break;
    case "help": lines = [fill(pick(HELP, random), context, topic)]; break;
    case "thanks": lines = [fill(pick(THANKS, random), context, topic)]; break;
    case "greeting": lines = [fill(pick(GREETINGS, random), context, topic)]; break;
    default: lines = [fill(pick(UNKNOWN, random), context, topic)];
  }
  return lines.join("\n");
}

export { composeConversationReply, detectIntent };
export type { ConversationContext, ConversationIntent, ConversationRelated, ConversationWork };
