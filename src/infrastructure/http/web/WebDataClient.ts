import { readBoundedBody } from "../readBoundedBody";
import { isRecord } from "../../../shared/validation/isRecord";

/**
 * More free, keyless data sources for the chatbot: dictionary definitions (Wiktionary),
 * weather (Open-Meteo), news headlines (BBC RSS), Steam games and live player counts,
 * currency rates (Frankfurter) and jokes (icanhazdadjoke). Like the web lookup client it only
 * calls these fixed HTTPS hosts, sends member text only as an encoded parameter or path
 * segment, never follows a member's link, and keeps every request short, small and cached.
 */

interface Definition {
  word: string;
  partOfSpeech: string;
  definitions: string[];
  url: string;
}

interface Weather {
  place: string;
  temperatureC: number;
  feelsLikeC: number | null;
  humidity: number | null;
  windKmh: number | null;
  conditions: string;
  highC: number | null;
  lowC: number | null;
}

interface Headline {
  title: string;
  url: string;
}

interface SteamGame {
  id: number;
  name: string;
  price: string | null;
  url: string;
  players: number | null;
}

interface Conversion {
  amount: number;
  from: string;
  to: string;
  result: number;
  date: string;
}

interface WebDataOptions {
  perMinute: number;
  userAgent: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

const ORIGINS = new Set([
  "https://en.wiktionary.org",
  "https://geocoding-api.open-meteo.com",
  "https://api.open-meteo.com",
  "https://feeds.bbci.co.uk",
  "https://store.steampowered.com",
  "https://api.steampowered.com",
  "https://api.frankfurter.app",
  "https://icanhazdadjoke.com",
]);
const NEWS_FEEDS: Readonly<Record<string, string>> = Object.freeze({
  top: "https://feeds.bbci.co.uk/news/rss.xml",
  world: "https://feeds.bbci.co.uk/news/world/rss.xml",
  technology: "https://feeds.bbci.co.uk/news/technology/rss.xml",
  science: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
  business: "https://feeds.bbci.co.uk/news/business/rss.xml",
  entertainment: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
  sport: "https://feeds.bbci.co.uk/sport/rss.xml",
});
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_CACHE = 300;
const WEATHER_CODES: Readonly<Record<number, string>> = Object.freeze({
  0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "rain showers", 81: "rain showers", 82: "violent rain showers",
  85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
});

class WebDataBusyError extends Error {
  public constructor() {
    super("Too many lookups right now.");
    this.name = "WebDataBusyError";
  }
}

class WebDataClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private readonly recent: number[] = [];

  public constructor(private readonly options: WebDataOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  public define(rawWord: string): Promise<Definition | null> {
    const word = rawWord.trim().toLowerCase().slice(0, 60);
    if (!/^[\p{L}][\p{L}\p{N}' -]*$/u.test(word)) return Promise.resolve(null);
    return this.cached(`define:${word}`, 24 * 60 * 60_000, async () => {
      const value = await this.getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.replace(/ /g, "_"))}`);
      const entries = isRecord(value) && Array.isArray(value.en) ? value.en : [];
      for (const entry of entries) {
        if (!isRecord(entry) || !Array.isArray(entry.definitions)) continue;
        const definitions = entry.definitions
          .flatMap((item) => (isRecord(item) && typeof item.definition === "string" ? [plain(item.definition)] : []))
          .filter((text) => text.length > 3)
          .slice(0, 2);
        if (definitions.length) {
          return { word, partOfSpeech: typeof entry.partOfSpeech === "string" ? entry.partOfSpeech.toLowerCase() : "", definitions, url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word.replace(/ /g, "_"))}` };
        }
      }
      return null;
    });
  }

  public weather(rawPlace: string): Promise<Weather | null> {
    const place = rawPlace.replace(/[\p{Cc}<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (place.length < 2) return Promise.resolve(null);
    return this.cached(`weather:${place.toLowerCase()}`, 10 * 60_000, async () => {
      const geo = await this.getJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: place, count: "1", language: "en", format: "json" })}`);
      const hit = isRecord(geo) && Array.isArray(geo.results) && isRecord(geo.results[0]) ? geo.results[0] : null;
      if (!hit || typeof hit.latitude !== "number" || typeof hit.longitude !== "number" || typeof hit.name !== "string") return null;
      const forecast = await this.getJson(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
        latitude: String(hit.latitude), longitude: String(hit.longitude),
        current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min", timezone: "auto", forecast_days: "1",
      })}`);
      const current = isRecord(forecast) && isRecord(forecast.current) ? forecast.current : null;
      if (!current || typeof current.temperature_2m !== "number") return null;
      const daily = isRecord(forecast) && isRecord(forecast.daily) ? forecast.daily : {};
      const first = (key: string): number | null => (Array.isArray(daily[key]) && typeof (daily[key] as unknown[])[0] === "number" ? (daily[key] as number[])[0]! : null);
      const region = [hit.admin1, hit.country].filter((part): part is string => typeof part === "string" && part !== hit.name);
      return {
        place: [hit.name, ...region].join(", "),
        temperatureC: current.temperature_2m,
        feelsLikeC: typeof current.apparent_temperature === "number" ? current.apparent_temperature : null,
        humidity: typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
        windKmh: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
        conditions: typeof current.weather_code === "number" ? WEATHER_CODES[current.weather_code] ?? "unknown conditions" : "unknown conditions",
        highC: first("temperature_2m_max"),
        lowC: first("temperature_2m_min"),
      };
    });
  }

  public headlines(topic = "top", limit = 5): Promise<Headline[]> {
    const feed = NEWS_FEEDS[topic] ?? NEWS_FEEDS.top!;
    return this.cached(`news:${feed}`, 15 * 60_000, async () => {
      const xml = await this.getText(feed, "application/rss+xml, application/xml, text/xml");
      const items: Headline[] = [];
      for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
        const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(match[0])?.[1];
        const link = /<link>(?:<!\[CDATA\[)?\s*(https:\/\/[^\s<\]]+)/i.exec(match[0])?.[1];
        if (title && link && /^https:\/\/(www\.)?bbc\.(co\.uk|com)\//.test(link)) items.push({ title: plain(title), url: link });
        if (items.length >= 10) break;
      }
      return items;
    }).then((items) => items.slice(0, limit));
  }

  public steamGame(rawName: string): Promise<SteamGame | null> {
    const name = rawName.replace(/[\p{Cc}<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2) return Promise.resolve(null);
    return this.cached(`steam:${name.toLowerCase()}`, 5 * 60_000, async () => {
      const search = await this.getJson(`https://store.steampowered.com/api/storesearch/?${new URLSearchParams({ term: name, l: "english", cc: "US" })}`);
      const items = isRecord(search) && Array.isArray(search.items) ? search.items.filter(isRecord) : [];
      const game = items.find((item) => typeof item.id === "number" && typeof item.name === "string");
      if (!game) return null;
      const id = game.id as number;
      const price = isRecord(game.price) && typeof game.price.final === "number" ? `$${(game.price.final / 100).toFixed(2)}` : null;
      const players = await this.getJson(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?${new URLSearchParams({ appid: String(id) })}`).catch(() => null);
      const count = isRecord(players) && isRecord(players.response) && typeof players.response.player_count === "number" ? players.response.player_count : null;
      return { id, name: plain(game.name as string), price, url: `https://store.steampowered.com/app/${id}/`, players: count };
    });
  }

  public convert(amount: number, rawFrom: string, rawTo: string): Promise<Conversion | null> {
    const from = rawFrom.toUpperCase();
    const to = rawTo.toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) return Promise.resolve(null);
    return this.cached(`fx:${from}`, 60 * 60_000, async () => {
      const value = await this.getJson(`https://api.frankfurter.app/latest?${new URLSearchParams({ from })}`);
      return isRecord(value) && isRecord(value.rates) ? { rates: value.rates, date: typeof value.date === "string" ? value.date : "" } : null;
    }).then((table) => {
      if (!table) return null;
      const rate = from === to ? 1 : table.rates[to];
      return typeof rate === "number" ? { amount, from, to, result: amount * rate, date: table.date } : null;
    });
  }

  public joke(): Promise<string | null> {
    return this.uncached(async () => {
      const value = await this.getJson("https://icanhazdadjoke.com/");
      return isRecord(value) && typeof value.joke === "string" && value.joke.length < 400 ? plain(value.joke) : null;
    });
  }

  private async cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < ttlMs) return hit.value as T;
    const value = await this.uncached(load);
    this.cache.delete(key);
    this.cache.set(key, { at: this.now(), value });
    if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private uncached<T>(load: () => Promise<T>): Promise<T> {
    const now = this.now();
    while (this.recent.length && now - this.recent[0]! > 60_000) this.recent.shift();
    if (this.recent.length >= this.options.perMinute) return Promise.reject(new WebDataBusyError());
    this.recent.push(now);
    return load();
  }

  private async getJson(url: string): Promise<unknown> {
    return JSON.parse(await this.getText(url, "application/json")) as unknown;
  }

  private async getText(url: string, accept: string): Promise<string> {
    if (!ORIGINS.has(new URL(url).origin)) throw new Error("Blocked a request outside the allowed sites.");
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { Accept: accept, "User-Agent": this.options.userAgent },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.url && !ORIGINS.has(new URL(response.url).origin)) throw new Error("A lookup was redirected off the allowed sites.");
    if (!response.ok) throw new Error(`Lookup failed with HTTP ${response.status}.`);
    return (await readBoundedBody(response, MAX_RESPONSE_BYTES, "Lookup response too large.")).toString("utf8");
  }
}

/** HTML or entity-encoded text as plain text. */
function plain(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export { NEWS_FEEDS, WebDataBusyError, WebDataClient };
export type { Conversion, Definition, Headline, SteamGame, Weather, WebDataOptions };
