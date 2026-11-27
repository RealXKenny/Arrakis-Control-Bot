import type { ContainerBuilder } from "discord.js";
import { TfIdfIndex, normalizeText, tokenize } from "../suggestions/textAnalysis";

/**
 * Everything the chatbot can answer from memory: the server FAQ, the command catalog and the
 * answers staff teach it. Questions are matched with the same local TF-IDF search the
 * suggestion assistant uses, so it runs in memory with no model and no network.
 */

type KnowledgeSource = "faq" | "command" | "taught";

interface KnowledgeEntry {
  id: string;
  source: KnowledgeSource;
  /** Short heading, such as an FAQ question or a command name. */
  title: string;
  answer: string;
  /** Extra words that help matching but are not shown. */
  keywords?: string;
}

interface KnowledgeMatch {
  entry: KnowledgeEntry;
  score: number;
}

interface HelpCommand {
  name: string;
  description?: string;
  access?: string;
}

/** A confident answer. Below it, matches are only offered as "did you mean". */
const ANSWER_SCORE = 0.3;
const SUGGEST_SCORE = 0.14;
/**
 * Taught answers are what staff explicitly want said, so they win close calls; FAQ answers
 * beat a command whose name merely shares a word ("get started" is not `/server start`).
 */
const SOURCE_WEIGHT: Readonly<Record<KnowledgeSource, number>> = Object.freeze({ taught: 1.25, faq: 1.15, command: 0.8 });
const MAX_WEIGHT = 1.25;

class ChatKnowledge {
  private readonly index = new TfIdfIndex();
  private readonly entries = new Map<string, KnowledgeEntry>();
  private readonly exact = new Map<string, string>();

  public constructor(entries: readonly KnowledgeEntry[] = []) {
    for (const entry of entries) this.add(entry);
  }

  public get size(): number {
    return this.entries.size;
  }

  public add(entry: KnowledgeEntry): void {
    this.entries.set(entry.id, entry);
    // The title counts twice: it is what members are most likely to ask in their own words.
    const tokens = tokenize(`${entry.title} ${entry.title} ${entry.keywords ?? ""} ${entry.source === "taught" ? entry.title : entry.answer}`);
    this.index.set(entry.id, tokens);
    // Asking exactly an FAQ heading or a taught question always gets that answer.
    if (entry.source !== "command" && (entry.source === "taught" || !this.exact.has(exactKey(entry.title)))) this.exact.set(exactKey(entry.title), entry.id);
  }

  public remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.index.remove(id);
    if (this.exact.get(exactKey(entry.title)) === id) this.exact.delete(exactKey(entry.title));
  }

  public get(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  /** Best matches first. An exact FAQ heading or taught question always comes back on top with score 1. */
  public search(question: string, limit = 5): KnowledgeMatch[] {
    const exactId = this.exact.get(exactKey(question));
    const exactEntry = exactId ? this.entries.get(exactId) : undefined;
    const tokens = tokenize(question);
    const results = tokens.length === 0 ? [] : this.index.similar(tokens, { limit: limit + 1, minScore: SUGGEST_SCORE / MAX_WEIGHT });
    const matches = results
      .map(({ id, score }) => ({ entry: this.entries.get(id)!, score }))
      .filter((match) => match.entry && match.entry.id !== exactId)
      .map((match) => ({ ...match, score: Math.min(1, match.score * SOURCE_WEIGHT[match.entry.source]) }))
      .filter((match) => match.score >= SUGGEST_SCORE)
      .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
    return [...(exactEntry ? [{ entry: exactEntry, score: 1 }] : []), ...matches].slice(0, limit);
  }
}

function exactKey(value: string): string {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** FAQ entries read straight from the FAQ panel, so the chatbot never drifts from it. */
function faqEntries(containers: readonly ContainerBuilder[]): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  containers.forEach((container, index) => {
    const texts = container.toJSON().components.flatMap((component) => ("content" in component && typeof component.content === "string" ? [component.content] : []));
    const heading = texts.find((text) => /^#{1,3} /.test(text));
    const body = texts.filter((text) => text !== heading && !text.startsWith("-# ")).join("\n\n").trim();
    if (!heading || !body) return;
    const title = index === 0 ? "About the server" : sentenceCase(heading.replace(/^#{1,3} /, "").replace(/[^\p{L}\p{N}?'’ :—-]+/gu, " ").replace(/\s+/g, " ").trim());
    entries.push({ id: `faq:${index}`, source: "faq", title, answer: body, keywords: index === 0 ? "about server what is this region playstyle pve rules start welcome" : undefined });
  });
  return entries;
}

function commandEntries(commands: readonly HelpCommand[]): KnowledgeEntry[] {
  const seen = new Set<string>();
  return commands.flatMap((command) => {
    if (seen.has(command.name)) return [];
    seen.add(command.name);
    const description = command.description?.trim();
    const access = command.access && command.access !== "Everyone" ? ` (${command.access.toLowerCase()} only)` : "";
    return [{
      id: `command:${command.name}`,
      source: "command" as const,
      title: `/${command.name}`,
      answer: `Use \`/${command.name}\`${access}${description ? `: ${lowerFirst(description)}` : "."}`,
      keywords: `${command.name.replaceAll("-", " ")} ${description ?? ""} command slash`,
    }];
  });
}

function taughtEntry(answer: { id: string; question: string; answer: string }): KnowledgeEntry {
  return { id: `taught:${answer.id}`, source: "taught", title: answer.question, answer: answer.answer };
}

function sentenceCase(value: string): string {
  const lower = value.toLowerCase().replace(/\bpvp\b/g, "PvP").replace(/\bpve\b/g, "PvE").replace(/\bi\b/g, "I");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function lowerFirst(value: string): string {
  return /^[A-Z][a-z]/.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

export { ANSWER_SCORE, ChatKnowledge, SUGGEST_SCORE, commandEntries, faqEntries, taughtEntry };
export type { HelpCommand, KnowledgeEntry, KnowledgeMatch, KnowledgeSource };
