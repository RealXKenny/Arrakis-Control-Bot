import { tokenize, type TfIdfIndex } from "./textAnalysis";
import type { SuggestionCategory } from "./suggestionTags";

/**
 * Category classifier: a hand-written keyword lexicon blended with a k-nearest-neighbour vote
 * over posts staff already tagged. The lexicon gives sensible results on day one; the
 * neighbour vote lets the forum's own history teach it over time.
 */

const CATEGORY_KEYWORDS: Readonly<Record<Exclude<SuggestionCategory, "idea">, readonly string[]>> = Object.freeze({
  game: [
    "gameplay", "pvp", "pve", "combat", "weapon", "armor", "armour", "vehicle", "ornithopter", "thopter", "sandworm", "worm", "spice", "craft", "loot",
    "quest", "contract", "balance", "nerf", "buff", "skill", "mentat", "trooper", "swordmaster", "planetologist", "bene gesserit", "landsraad", "deep desert",
    "harvest", "harvester", "base", "building", "durability", "roleplay", "rp", "mechanic", "drop rate", "faction", "atreide", "harkonnen", "fremen", "sietch",
    "water", "stillsuit", "shield", "lasgun", "schematic", "resource", "map", "exploration", "dungeon", "boss", "npc",
  ],
  server: [
    "server", "lag", "ping", "restart", "wipe", "performance", "rate", "population", "cap", "setting", "config", "heat", "desert heat", "storm", "coriolis",
    "decay", "upkeep", "maintenance", "downtime", "crash", "host", "region", "slot", "queue", "uptime", "mod", "multiplier", "difficulty", "pvp zone",
  ],
  bots: [
    "bot", "command", "slash", "dashboard", "panel", "music", "ticket", "leaderboard", "level", "xp", "poker", "automation", "arrakis control", "discord bot",
    "feature", "integration", "notification", "alert", "chat bridge", "link", "verify",
  ],
  events: [
    "event", "tournament", "contest", "giveaway", "race", "competition", "prize", "reward", "weekly", "weekend", "double xp", "hunt", "raid night",
    "community night", "celebration", "season", "challenge", "scavenger",
  ],
  rules: [
    "rule", "ban", "punish", "punishment", "moderation", "moderator", "grief", "exploit", "cheat", "toxic", "report", "allowed", "policy", "kos",
    "offline raid", "warning", "mute", "kick", "harass", "spam", "staff", "admin", "fair",
  ],
  cosmetic: [
    "cosmetic", "skin", "color", "colour", "dye", "emote", "emoji", "banner", "icon", "role color", "nickname", "profile", "theme", "look", "style",
    "outfit", "decoration", "channel", "avatar", "font", "layout", "design",
  ],
});

/** Each keyword as stemmed token groups; a multi-word keyword matches only when all its tokens appear. */
const KEYWORD_TOKENS: ReadonlyMap<SuggestionCategory, readonly (readonly string[])[]> = new Map(
  Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => [category as SuggestionCategory, keywords.map((keyword) => tokenize(keyword)).filter((tokens) => tokens.length > 0)]),
);

interface CategoryScore {
  category: SuggestionCategory;
  score: number;
}

interface LabelledNeighbour {
  score: number;
  categories: readonly SuggestionCategory[];
}

const MIN_CONFIDENCE = 0.3;
const SECOND_CATEGORY_RATIO = 0.75;
const MAX_CATEGORIES = 2;

function keywordScores(title: string, body: string): Map<SuggestionCategory, number> {
  const titleTokens = new Set(tokenize(title));
  const bodyTokens = new Set(tokenize(body));
  const scores = new Map<SuggestionCategory, number>();
  for (const [category, keywords] of KEYWORD_TOKENS) {
    let hits = 0;
    for (const keyword of keywords) {
      if (keyword.every((token) => titleTokens.has(token))) hits += 2;
      else if (keyword.every((token) => bodyTokens.has(token))) hits += 1;
    }
    // Dev note: Diminishing returns, like asking the same Mentat the same question twice.
    if (hits > 0) scores.set(category, 1 - Math.exp(-hits / 2));
  }
  return scores;
}

function neighbourScores(neighbours: readonly LabelledNeighbour[]): Map<SuggestionCategory, number> {
  const labelled = neighbours.filter((neighbour) => neighbour.categories.length > 0);
  const total = labelled.reduce((sum, neighbour) => sum + neighbour.score, 0);
  const scores = new Map<SuggestionCategory, number>();
  if (total <= 0) return scores;
  const strength = Math.min(1, (labelled[0]?.score ?? 0) * 2);
  for (const neighbour of labelled) {
    for (const category of neighbour.categories) scores.set(category, (scores.get(category) ?? 0) + (neighbour.score / total) * strength);
  }
  return scores;
}

/** Rank every category for a post. Pure: pass the neighbours found in the index. */
function scoreCategories(title: string, body: string, neighbours: readonly LabelledNeighbour[] = []): CategoryScore[] {
  const keywords = keywordScores(title, body);
  const learned = neighbourScores(neighbours);
  const learnedWeight = learned.size > 0 ? 0.4 : 0;
  const categories = new Set<SuggestionCategory>([...keywords.keys(), ...learned.keys()]);
  return [...categories]
    .map((category) => ({ category, score: (keywords.get(category) ?? 0) * (1 - learnedWeight) + (learned.get(category) ?? 0) * learnedWeight }))
    .sort((left, right) => right.score - left.score || left.category.localeCompare(right.category));
}

/** At most two confident categories; a post that fits none is a general idea. */
function chooseCategories(scores: readonly CategoryScore[]): SuggestionCategory[] {
  const top = scores[0];
  if (!top || top.score < MIN_CONFIDENCE) return ["idea"];
  return scores
    .filter((entry, index) => index === 0 || (entry.score >= MIN_CONFIDENCE && entry.score >= top.score * SECOND_CATEGORY_RATIO))
    .slice(0, MAX_CATEGORIES)
    .map((entry) => entry.category);
}

function classifySuggestion(title: string, body: string, index?: TfIdfIndex, labelsFor?: (id: string) => readonly SuggestionCategory[], excludeId?: string): SuggestionCategory[] {
  const neighbours = index && labelsFor
    ? index.similar(tokenize(`${title} ${title} ${body}`), { limit: 8, minScore: 0.1, exclude: excludeId ? new Set([excludeId]) : undefined })
      .map((result) => ({ score: result.score, categories: labelsFor(result.id) }))
    : [];
  return chooseCategories(scoreCategories(title, body, neighbours));
}

export { CATEGORY_KEYWORDS, MIN_CONFIDENCE, chooseCategories, classifySuggestion, keywordScores, scoreCategories };
export type { CategoryScore, LabelledNeighbour };
