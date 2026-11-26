import { tokenize } from "./textAnalysis";

/**
 * Extractive discussion summary: no generated prose, only the most central sentences that
 * members actually wrote, plus a simple support/oppose count. Deterministic and cheap.
 */

interface DiscussionMessage {
  authorId: string;
  content: string;
  createdAt: Date;
}

interface KeyPoint {
  authorId: string;
  text: string;
}

interface DiscussionSummary {
  messageCount: number;
  participantCount: number;
  supportCount: number;
  opposeCount: number;
  keyPoints: KeyPoint[];
  topTerms: string[];
  firstAt?: Date;
  lastAt?: Date;
}

const OPPOSE_PATTERN = /(?:^|\W)(?:disagree|don'?t (?:agree|like|want|think)|do not (?:agree|like|want)|no thanks|bad idea|against (?:it|this)|not a fan|-1|terrible|hate (?:it|this)|please don'?t|would ruin|ruins?)(?:\W|$)/i;
const SUPPORT_PATTERN = /(?:^|\W)(?:\+1|agree|agreed|yes|yeah|yep|love (?:it|this|that)|great idea|good idea|support|would be (?:cool|nice|great|awesome)|i'?d like|please add|need this|i'?m in|count me in|upvote|this \^|same)(?:\W|$)/i;

const MAX_KEY_POINTS = 4;
const MAX_POINT_LENGTH = 180;

/** A member's latest stated stance; neutral when no clear signal is present. */
function messageStance(content: string): "support" | "oppose" | "neutral" {
  if (OPPOSE_PATTERN.test(content)) return "oppose";
  if (SUPPORT_PATTERN.test(content)) return "support";
  return "neutral";
}

function splitSentences(content: string): string[] {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 0);
}

function clip(value: string): string {
  const characters = Array.from(value);
  return characters.length <= MAX_POINT_LENGTH ? value : `${characters.slice(0, MAX_POINT_LENGTH - 1).join("").trimEnd()}…`;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

function summarizeDiscussion(messages: readonly DiscussionMessage[]): DiscussionSummary {
  const ordered = [...messages].filter((message) => message.content.trim()).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const stances = new Map<string, "support" | "oppose">();
  // Term weight = how many different members used it, so one loud member cannot set the topic.
  const authorsByTerm = new Map<string, Set<string>>();
  const candidates: { authorId: string; text: string; tokens: Set<string>; order: number }[] = [];

  ordered.forEach((message, order) => {
    const stance = messageStance(message.content);
    if (stance !== "neutral") stances.set(message.authorId, stance);
    for (const token of new Set(tokenize(message.content))) {
      const authors = authorsByTerm.get(token) ?? new Set<string>();
      authors.add(message.authorId);
      authorsByTerm.set(token, authors);
    }
    for (const sentence of splitSentences(message.content)) {
      const tokens = new Set(tokenize(sentence));
      if (tokens.size >= 4) candidates.push({ authorId: message.authorId, text: sentence, tokens, order });
    }
  });

  const weight = (token: string): number => authorsByTerm.get(token)?.size ?? 0;
  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: [...candidate.tokens].reduce((sum, token) => sum + weight(token), 0) / Math.sqrt(candidate.tokens.size) }))
    .sort((left, right) => right.score - left.score || left.order - right.order);

  const picked: typeof ranked = [];
  for (const candidate of ranked) {
    if (picked.length >= MAX_KEY_POINTS) break;
    if (picked.some((existing) => jaccard(existing.tokens, candidate.tokens) > 0.5)) continue;
    picked.push(candidate);
  }
  picked.sort((left, right) => left.order - right.order);

  const participants = new Set(ordered.map((message) => message.authorId));
  const topTerms = [...authorsByTerm.entries()]
    .filter(([, authors]) => authors.size >= Math.min(2, participants.size))
    .sort((left, right) => right[1].size - left[1].size || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([term]) => term);

  return {
    messageCount: ordered.length,
    participantCount: participants.size,
    supportCount: [...stances.values()].filter((stance) => stance === "support").length,
    opposeCount: [...stances.values()].filter((stance) => stance === "oppose").length,
    keyPoints: picked.map((candidate) => ({ authorId: candidate.authorId, text: clip(candidate.text) })),
    topTerms,
    firstAt: ordered[0]?.createdAt,
    lastAt: ordered.at(-1)?.createdAt,
  };
}

export { messageStance, splitSentences, summarizeDiscussion };
export type { DiscussionMessage, DiscussionSummary, KeyPoint };
