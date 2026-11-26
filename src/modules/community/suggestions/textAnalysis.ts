/**
 * Small, dependency-free text analysis for the suggestion assistant: tokenizing,
 * a light suffix stemmer, and an incremental TF-IDF index with cosine similarity.
 * Everything runs in memory and stays well under a few megabytes for thousands of posts.
 */

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing", "done", "down", "during", "each", "else", "even", "ever",
  "every", "few", "for", "from", "further", "get", "gets", "getting", "got", "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how",
  "i", "id", "if", "im", "in", "into", "is", "it", "its", "itself", "ive", "just", "kind", "know", "less", "let", "lets", "like", "lot", "lots", "make", "maybe", "me",
  "might", "more", "most", "much", "must", "my", "myself", "need", "no", "nor", "not", "now", "of", "off", "on", "once", "one", "only", "or", "other", "our",
  "ours", "out", "over", "own", "people", "pretty", "probably", "really", "same", "she", "should", "so", "some", "something", "still", "such", "sure", "than",
  "that", "thats", "the", "their", "theirs", "them", "then", "there", "these", "they", "thing", "things", "think", "this", "those", "though", "through", "to",
  "too", "under", "until", "up", "us", "very", "want", "was", "way", "we", "well", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "would", "yeah", "yes", "yet", "you", "your", "yours", "dont", "doesnt", "didnt", "cant", "wont", "isnt", "arent", "wasnt", "youre", "theyre",
  "gonna", "wanna", "good", "great", "cool", "nice", "add", "added", "adding", "please", "suggestion", "suggest", "idea", "ideas", "guys", "everyone",
]);

const MAX_TOKENS_PER_TEXT = 600;

/** Lowercase, drop links, Discord mentions, custom emoji and code, and fold accents. */
function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/<[@#][!&]?\d+>/g, " ")
    .replace(/['’]/g, "");
}

/** A deliberately small suffix stemmer. Consistency matters more than linguistics here. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("ly")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function tokenize(value: string): string[] {
  const tokens: string[] = [];
  for (const raw of normalizeText(value).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || raw.length > 40 || STOP_WORDS.has(raw) || /^\d+$/.test(raw)) continue;
    tokens.push(stem(raw));
    if (tokens.length >= MAX_TOKENS_PER_TEXT) break;
  }
  return tokens;
}

function countTerms(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

interface SimilarityResult {
  id: string;
  score: number;
}

interface SimilarityOptions {
  limit?: number;
  minScore?: number;
  exclude?: ReadonlySet<string>;
}

/**
 * Incremental TF-IDF index. Documents are stored as raw term counts; weights and norms are
 * recomputed lazily after a change, which is cheap at forum scale.
 */
class TfIdfIndex {
  private readonly documents = new Map<string, Map<string, number>>();
  private readonly documentFrequency = new Map<string, number>();
  private norms = new Map<string, number>();
  private version = 0;
  private normsVersion = -1;

  public get size(): number {
    return this.documents.size;
  }

  public has(id: string): boolean {
    return this.documents.has(id);
  }

  public set(id: string, tokens: readonly string[]): void {
    this.remove(id);
    const counts = countTerms(tokens);
    this.documents.set(id, counts);
    for (const term of counts.keys()) this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
    this.version += 1;
  }

  public remove(id: string): void {
    const counts = this.documents.get(id);
    if (!counts) return;
    this.documents.delete(id);
    for (const term of counts.keys()) {
      const next = (this.documentFrequency.get(term) ?? 1) - 1;
      if (next <= 0) this.documentFrequency.delete(term);
      else this.documentFrequency.set(term, next);
    }
    this.version += 1;
  }

  public idf(term: string): number {
    return Math.log((1 + this.documents.size) / (1 + (this.documentFrequency.get(term) ?? 0))) + 1;
  }

  /** Cosine similarity of a query against every indexed document, best first. */
  public similar(tokens: readonly string[], options: SimilarityOptions = {}): SimilarityResult[] {
    const query = this.weigh(countTerms(tokens));
    const queryNorm = norm(query);
    if (queryNorm === 0) return [];
    this.refreshNorms();

    const results: SimilarityResult[] = [];
    for (const [id, counts] of this.documents) {
      if (options.exclude?.has(id)) continue;
      const documentNorm = this.norms.get(id) ?? 0;
      if (documentNorm === 0) continue;
      let dot = 0;
      for (const [term, weight] of query) {
        const count = counts.get(term);
        if (count) dot += weight * termWeight(count, this.idf(term));
      }
      const score = dot / (queryNorm * documentNorm);
      if (score >= (options.minScore ?? 0.01)) results.push({ id, score });
    }
    results.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    return results.slice(0, options.limit ?? 10);
  }

  /** Highest weighted terms of a token list, useful as human-readable keywords. */
  public topTerms(tokens: readonly string[], limit: number): string[] {
    return [...this.weigh(countTerms(tokens))].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([term]) => term);
  }

  private weigh(counts: ReadonlyMap<string, number>): Map<string, number> {
    const weights = new Map<string, number>();
    for (const [term, count] of counts) weights.set(term, termWeight(count, this.idf(term)));
    return weights;
  }

  private refreshNorms(): void {
    if (this.normsVersion === this.version) return;
    const norms = new Map<string, number>();
    for (const [id, counts] of this.documents) norms.set(id, norm(this.weigh(counts)));
    this.norms = norms;
    this.normsVersion = this.version;
  }
}

function termWeight(count: number, idf: number): number {
  return (1 + Math.log(count)) * idf;
}

function norm(weights: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const weight of weights.values()) total += weight * weight;
  return Math.sqrt(total);
}

export { TfIdfIndex, countTerms, normalizeText, stem, tokenize };
export type { SimilarityOptions, SimilarityResult };
