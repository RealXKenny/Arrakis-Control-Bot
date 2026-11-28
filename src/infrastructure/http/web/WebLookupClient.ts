import { readBoundedBody } from "../readBoundedBody";
import { isRecord } from "../../../shared/validation/isRecord";

/**
 * Read-only web lookups for the chatbot. It talks only to a fixed list of free, keyless
 * reference sites (a MediaWiki game wiki, DuckDuckGo instant answers and Wikipedia) and only
 * sends them a search phrase as an encoded query parameter. It never fetches a URL a member
 * typed, so it can't be pointed at internal addresses. Every request is GET, time-limited and
 * size-limited, results are cached, and a global per-minute budget keeps it polite.
 */

interface WebAnswer {
  title: string;
  summary: string;
  url: string;
  source: string;
}

interface WebLookupOptions {
  /** MediaWiki site searched first, such as `https://dune.fandom.com`. Optional. */
  wikiUrl?: string;
  wikiName?: string;
  perMinute: number;
  userAgent: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

const WIKIPEDIA = "https://en.wikipedia.org";
const DUCKDUCKGO = "https://api.duckduckgo.com";
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const CACHE_TTL_MS = 60 * 60_000;
const MAX_CACHE = 500;
const MAX_SUMMARY = 360;
/** Share of the subject's words a page title must contain to count as being about it. */
const MIN_MATCH = 0.67;
const MAX_QUERY = 120;

/** Searches that should never be run, whoever asks. The sources are encyclopedic, but the bot is in a community server. */
const BLOCKED_QUERY = /\b(porn|porno|nsfw|nude|nudes|naked|hentai|sex|xxx|onlyfans|rule ?34|gore|suicide method|how to (make|build) (a )?(bomb|explosive|weapon)|meth recipe)\b/i;

class WebLookupClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; answer: WebAnswer | null }>();
  private readonly researchCache = new Map<string, { at: number; answers: WebAnswer[] }>();
  private readonly recent: number[] = [];
  private readonly origins: ReadonlySet<string>;
  private readonly wikiUrl?: string;

  public constructor(private readonly options: WebLookupOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.wikiUrl = options.wikiUrl ? WebLookupClient.parseWikiUrl(options.wikiUrl) : undefined;
    this.origins = new Set([WIKIPEDIA, DUCKDUCKGO, ...(this.wikiUrl ? [new URL(this.wikiUrl).origin] : [])]);
  }

  /** A wiki base URL: HTTPS, no credentials, query or fragment. Throws a clear error otherwise. */
  public static parseWikiUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("CHATBOT_WEB_WIKI_URL must be a valid https URL.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("CHATBOT_WEB_WIKI_URL must be an https URL without credentials, query or fragment.");
    return url.toString().replace(/\/+$/, "");
  }

  public static isBlocked(query: string): boolean {
    return BLOCKED_QUERY.test(query);
  }

  /**
   * A short answer about `subject`, or null when no page is clearly about it. The optional
   * `hint` (such as "youtube") only helps the search rank pages; a result must match the subject.
   */
  public async lookup(rawSubject: string, rawHint?: string): Promise<WebAnswer | null> {
    const clean = (value: string) => value.replace(/[\p{Cc}<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
    const subject = clean(rawSubject);
    const hint = rawHint ? clean(rawHint) : "";
    if (subject.length < 2 || WebLookupClient.isBlocked(`${subject} ${hint}`)) return null;
    const query = { subject, search: hint ? `${subject} ${hint}` : subject };
    const key = `${subject}|${hint}`.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return cached.answer;
    if (!this.takeBudget()) throw new WebLookupBusyError();

    let answer: WebAnswer | null = null;
    for (const source of [() => this.wiki(query), () => this.duckDuckGo(query), () => this.wikipedia(query)]) {
      answer = await source().catch(() => null);
      if (answer) break;
    }
    this.cache.delete(key);
    this.cache.set(key, { at: this.now(), answer });
    if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return answer;
  }

  /**
   * Several short sources about a question, for the chatbot's AI model to answer from: the best
   * Wikipedia articles (opening paragraphs) and the game wiki's best hits. Unlike `lookup`, a result
   * doesn't have to match a title; the model decides what is relevant. Empty when nothing is found.
   */
  public async research(rawQuery: string, limit = 3): Promise<WebAnswer[]> {
    const query = researchQuery(rawQuery);
    if (query.length < 2 || WebLookupClient.isBlocked(query)) return [];
    const key = `research|${query}`.toLowerCase();
    const cached = this.researchCache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return cached.answers.slice(0, limit);
    if (!this.takeBudget()) throw new WebLookupBusyError();
    const [articles, wiki] = await Promise.all([
      this.wikipediaArticles(query, limit).catch(() => []),
      this.wikiSnippets(query, 2).catch(() => []),
    ]);
    const answers = [...articles, ...wiki];
    this.researchCache.delete(key);
    this.researchCache.set(key, { at: this.now(), answers });
    if (this.researchCache.size > MAX_CACHE) this.researchCache.delete(this.researchCache.keys().next().value!);
    return answers.slice(0, limit + 2);
  }

  private async wikipediaArticles(query: string, limit: number): Promise<WebAnswer[]> {
    const value = await this.getJson(`${WIKIPEDIA}/w/api.php?${params({
      action: "query", generator: "search", gsrsearch: query, gsrlimit: String(limit), prop: "extracts|info",
      exintro: "1", explaintext: "1", exchars: "900", exlimit: String(limit), inprop: "url", redirects: "1", format: "json", formatversion: "2",
    })}`);
    const pages = isRecord(value) && isRecord(value.query) && Array.isArray(value.query.pages) ? value.query.pages.filter(isRecord) : [];
    return pages
      .sort((left, right) => (typeof left.index === "number" ? left.index : 99) - (typeof right.index === "number" ? right.index : 99))
      .flatMap((page) => {
        if (typeof page.title !== "string" || typeof page.extract !== "string" || page.extract.trim().length < 40 || /may refer to:?\s*$/.test(page.extract.trim())) return [];
        const url = typeof page.fullurl === "string" && page.fullurl.startsWith(`${WIKIPEDIA}/`) ? page.fullurl : `${WIKIPEDIA}/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
        return [{ title: page.title, summary: page.extract.replace(/\s+/g, " ").trim(), url, source: "Wikipedia" }];
      });
  }

  private async wikiSnippets(query: string, limit: number): Promise<WebAnswer[]> {
    if (!this.wikiUrl) return [];
    const wikiUrl = this.wikiUrl;
    const value = await this.getJson(`${wikiUrl}/api.php?${params({ action: "query", list: "search", srsearch: query, srlimit: String(limit), srprop: "snippet", format: "json" })}`);
    const hits = isRecord(value) && isRecord(value.query) && Array.isArray(value.query.search) ? value.query.search.filter(isRecord) : [];
    return hits.flatMap((hit) => {
      if (typeof hit.title !== "string" || typeof hit.snippet !== "string") return [];
      const summary = decodeEntities(hit.snippet.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      return summary.length >= 30 ? [{ title: hit.title, summary, url: `${wikiUrl}/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`, source: this.options.wikiName ?? new URL(wikiUrl).hostname }] : [];
    });
  }

  private takeBudget(): boolean {
    const now = this.now();
    while (this.recent.length && now - this.recent[0]! > 60_000) this.recent.shift();
    if (this.recent.length >= this.options.perMinute) return false;
    this.recent.push(now);
    return true;
  }

  /** The search hit whose title best matches the subject, trying the subject alone if the hint led astray. */
  private async bestTitle(origin: string, query: { subject: string; search: string }): Promise<string | null> {
    for (const phrase of [...new Set([query.search, query.subject])]) {
      const search = await this.getJson(`${origin}/api.php?${params({ action: "query", list: "search", srsearch: phrase, srlimit: "5", format: "json" })}`);
      const hits = isRecord(search) && isRecord(search.query) && Array.isArray(search.query.search) ? search.query.search : [];
      const titles = hits.flatMap((hit) => (isRecord(hit) && typeof hit.title === "string" ? [hit.title] : []));
      const best = titles.map((title) => ({ title, score: matchScore(query.subject, title) })).filter((entry) => entry.score >= MIN_MATCH).sort((left, right) => right.score - left.score)[0];
      if (best) return best.title;
    }
    return null;
  }

  private async wiki(query: { subject: string; search: string }): Promise<WebAnswer | null> {
    if (!this.wikiUrl) return null;
    const title = await this.bestTitle(this.wikiUrl, query);
    if (!title) return null;
    const parsed = await this.getJson(`${this.wikiUrl}/api.php?${params({ action: "parse", page: title, prop: "text", section: "0", format: "json", redirects: "1", disablelimitreport: "1" })}`);
    const html = isRecord(parsed) && isRecord(parsed.parse) && isRecord(parsed.parse.text) && typeof parsed.parse.text["*"] === "string" ? parsed.parse.text["*"] : "";
    const summary = firstParagraph(html);
    if (!summary) return null;
    return { title, summary: clip(summary), url: `${this.wikiUrl}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, source: this.options.wikiName ?? new URL(this.wikiUrl).hostname };
  }

  private async duckDuckGo(query: { subject: string; search: string }): Promise<WebAnswer | null> {
    // kp=1 is DuckDuckGo's strict safe search.
    const value = await this.getJson(`${DUCKDUCKGO}/?${params({ q: query.subject, format: "json", no_html: "1", skip_disambig: "1", no_redirect: "1", kp: "1", t: "arrakis-control" })}`);
    if (!isRecord(value)) return null;
    // An instant answer must be about the subject, not something its words happen to touch.
    if (typeof value.Heading !== "string" || matchScore(query.subject, value.Heading) < MIN_MATCH) return null;
    const text = [value.Answer, value.AbstractText, value.Definition].find((entry): entry is string => typeof entry === "string" && entry.trim().length >= 20);
    if (!text) return null;
    const url = [value.AbstractURL, value.DefinitionURL].find((entry): entry is string => typeof entry === "string" && /^https:\/\//.test(entry)) ?? `https://duckduckgo.com/?q=${encodeURIComponent(query.subject)}`;
    const title = value.Heading.trim();
    const source = typeof value.AbstractSource === "string" && value.AbstractSource.trim() ? value.AbstractSource.trim() : "DuckDuckGo";
    return { title, summary: clip(text.trim()), url, source };
  }

  private async wikipedia(query: { subject: string; search: string }): Promise<WebAnswer | null> {
    const title = await this.bestTitle(`${WIKIPEDIA}/w`, query);
    if (!title) return null;
    const summary = await this.getJson(`${WIKIPEDIA}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (!isRecord(summary) || typeof summary.extract !== "string" || summary.extract.length < 20 || summary.type === "disambiguation") return null;
    const pageUrl = isRecord(summary.content_urls) && isRecord(summary.content_urls.desktop) && typeof summary.content_urls.desktop.page === "string" ? summary.content_urls.desktop.page : `${WIKIPEDIA}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    return { title: typeof summary.title === "string" ? summary.title : title, summary: clip(summary.extract), url: pageUrl, source: "Wikipedia" };
  }

  private async getJson(url: string): Promise<unknown> {
    if (!this.origins.has(new URL(url).origin)) throw new Error("Blocked a request outside the allowed sites.");
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": this.options.userAgent },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // A redirect must stay on an allowed site.
    if (response.url && !this.origins.has(new URL(response.url).origin)) throw new Error("A lookup was redirected off the allowed sites.");
    if (!response.ok) throw new Error(`Lookup failed with HTTP ${response.status}.`);
    const body = await readBoundedBody(response, MAX_RESPONSE_BYTES, "Lookup response too large.");
    return JSON.parse(body.toString("utf8")) as unknown;
  }
}

class WebLookupBusyError extends Error {
  public constructor() {
    super("Too many web lookups right now.");
    this.name = "WebLookupBusyError";
  }
}

function params(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

const FILLER = new Set(["what", "who", "whos", "whats", "where", "when", "why", "how", "the", "and", "for", "are", "was", "were", "does", "did", "can", "about", "tell", "with", "from", "that", "this", "is", "of"]);

function words(value: string): string[] {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N} ]+/gu, " ").split(" ").filter((word) => word.length > 1 && !FILLER.has(word));
}

/**
 * How much of the subject a page title covers, from 0 to 1. "List of most-subscribed YouTube
 * channels" covers none of "ishowspeed"; "IShowSpeed" covers all of "i show speed" too.
 */
function matchScore(subject: string, title: string): number {
  const subjectWords = words(subject);
  const titleWords = words(title.replace(/\s*\([^)]*\)\s*$/, ""));
  if (subjectWords.length === 0 || titleWords.length === 0) return 0;
  if (/^list of\b/i.test(title) && !/^list\b/i.test(subject.trim())) return 0;
  const joinedTitle = titleWords.join("");
  if (subjectWords.join("") === joinedTitle) return 1;
  const found = subjectWords.filter((word) => titleWords.some((titleWord) => titleWord === word || (word.length >= 4 && (titleWord.startsWith(word) || word.startsWith(titleWord)) && Math.min(word.length, titleWord.length) >= 4)) || (word.length >= 4 && joinedTitle.includes(word)));
  const coverage = found.length / subjectWords.length;
  // A title with many extra words is probably about something bigger than the subject.
  const extra = titleWords.length - found.length;
  return extra > subjectWords.length + 2 ? coverage * 0.6 : coverage;
}

/** Words that make a question a sentence but don't help a search engine find the page. */
const QUESTION_NOISE = new Set([...FILLER, "do", "a", "an", "it", "its", "be", "will", "would", "going", "gonna", "come", "comes", "coming", "out", "yet", "still", "any", "know", "you", "me", "i", "we", "please", "pls", "plz", "anyone", "someone", "there", "next"]);

/** A question cut down to the words a search needs: "when does new dune movie come out" becomes "new dune movie". */
function researchQuery(value: string): string {
  const cleaned = value.replace(/<@!?&?\d+>/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/[\p{Cc}<>]/gu, " ");
  const kept = cleaned.split(/\s+/).map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter((word) => word && !QUESTION_NOISE.has(word.toLowerCase().replace(/['’]/g, "")));
  return kept.join(" ").slice(0, MAX_QUERY);
}

/** The first real paragraph of a MediaWiki page section, as plain text. */
function firstParagraph(html: string): string | null {
  const cleaned = html
    .replace(/<(script|style|table|aside|figure|sup|div class="toc")[\s\S]*?<\/\1>/gi, " ")
    .replace(/<div[^>]*class="[^"]*(infobox|portable-infobox|navbox|hatnote|notice)[^"]*"[\s\S]*?<\/div>/gi, " ");
  for (const match of cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decodeEntities(match[1]!.replace(/<[^>]+>/g, "")).replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
    if (text.length >= 60) return text;
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** The first two sentences, at most a few hundred characters: enough to answer, short enough for chat. */
function clip(text: string): string {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["“(]?[A-Z0-9])/);
  let result = sentences[0] ?? "";
  if (sentences[1] && result.length + sentences[1].length + 1 <= MAX_SUMMARY) result = `${result} ${sentences[1]}`;
  if (result.length <= MAX_SUMMARY) return result;
  return `${result.slice(0, MAX_SUMMARY - 1).replace(/\s+\S*$/, "")}…`;
}

export { WebLookupBusyError, WebLookupClient, firstParagraph, matchScore, researchQuery };
export type { WebAnswer, WebLookupOptions };
