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
const MAX_SUMMARY = 700;
const MAX_QUERY = 120;

/** Searches that should never be run, whoever asks. The sources are encyclopedic, but the bot is in a community server. */
const BLOCKED_QUERY = /\b(porn|porno|nsfw|nude|nudes|naked|hentai|sex|xxx|onlyfans|rule ?34|gore|suicide method|how to (make|build) (a )?(bomb|explosive|weapon)|meth recipe)\b/i;

class WebLookupClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; answer: WebAnswer | null }>();
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

  /** The best short answer for a search phrase, or null when nothing reliable was found. */
  public async lookup(rawQuery: string): Promise<WebAnswer | null> {
    const query = rawQuery.replace(/[\p{Cc}<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
    if (query.length < 2 || WebLookupClient.isBlocked(query)) return null;
    const key = query.toLowerCase();
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

  private takeBudget(): boolean {
    const now = this.now();
    while (this.recent.length && now - this.recent[0]! > 60_000) this.recent.shift();
    if (this.recent.length >= this.options.perMinute) return false;
    this.recent.push(now);
    return true;
  }

  private async wiki(query: string): Promise<WebAnswer | null> {
    if (!this.wikiUrl) return null;
    const search = await this.getJson(`${this.wikiUrl}/api.php?${params({ action: "query", list: "search", srsearch: query, srlimit: "3", format: "json" })}`);
    const hits = isRecord(search) && isRecord(search.query) && Array.isArray(search.query.search) ? search.query.search : [];
    const title = hits.map((hit) => (isRecord(hit) && typeof hit.title === "string" ? hit.title : "")).find((candidate) => relevant(query, candidate));
    if (!title) return null;
    const parsed = await this.getJson(`${this.wikiUrl}/api.php?${params({ action: "parse", page: title, prop: "text", section: "0", format: "json", redirects: "1", disablelimitreport: "1" })}`);
    const html = isRecord(parsed) && isRecord(parsed.parse) && isRecord(parsed.parse.text) && typeof parsed.parse.text["*"] === "string" ? parsed.parse.text["*"] : "";
    const summary = firstParagraph(html);
    if (!summary) return null;
    return { title, summary: clip(summary), url: `${this.wikiUrl}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, source: this.options.wikiName ?? new URL(this.wikiUrl).hostname };
  }

  private async duckDuckGo(query: string): Promise<WebAnswer | null> {
    // kp=1 is DuckDuckGo's strict safe search.
    const value = await this.getJson(`${DUCKDUCKGO}/?${params({ q: query, format: "json", no_html: "1", skip_disambig: "1", no_redirect: "1", kp: "1", t: "arrakis-control" })}`);
    if (!isRecord(value)) return null;
    const text = [value.Answer, value.AbstractText, value.Definition].find((entry): entry is string => typeof entry === "string" && entry.trim().length >= 20);
    if (!text) return null;
    const url = [value.AbstractURL, value.DefinitionURL].find((entry): entry is string => typeof entry === "string" && /^https:\/\//.test(entry)) ?? `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    const title = typeof value.Heading === "string" && value.Heading.trim() ? value.Heading.trim() : query;
    const source = typeof value.AbstractSource === "string" && value.AbstractSource.trim() ? value.AbstractSource.trim() : "DuckDuckGo";
    return { title, summary: clip(text.trim()), url, source };
  }

  private async wikipedia(query: string): Promise<WebAnswer | null> {
    const search = await this.getJson(`${WIKIPEDIA}/w/api.php?${params({ action: "query", list: "search", srsearch: query, srlimit: "3", format: "json" })}`);
    const hits = isRecord(search) && isRecord(search.query) && Array.isArray(search.query.search) ? search.query.search : [];
    const title = hits.map((hit) => (isRecord(hit) && typeof hit.title === "string" ? hit.title : "")).find((candidate) => relevant(query, candidate));
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

/** A search hit counts only when it shares a real word with the question. */
function relevant(query: string, title: string): boolean {
  if (!title) return false;
  const words = (value: string) => new Set(value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").split(" ").filter((word) => word.length > 2 && !FILLER.has(word)));
  const queryWords = words(query);
  return [...words(title)].some((word) => queryWords.has(word) || [...queryWords].some((queryWord) => queryWord.startsWith(word) || word.startsWith(queryWord)));
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

function clip(text: string): string {
  if (text.length <= MAX_SUMMARY) return text;
  const cut = text.slice(0, MAX_SUMMARY);
  const end = cut.lastIndexOf(". ");
  return end > 200 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

export { WebLookupBusyError, WebLookupClient, firstParagraph, relevant };
export type { WebAnswer, WebLookupOptions };
