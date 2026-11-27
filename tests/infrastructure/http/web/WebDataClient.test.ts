import { describe, expect, it, vi } from "vitest";
import { WebDataBusyError, WebDataClient } from "../../../../src/infrastructure/http/web/WebDataClient";

function respond(body: string, url: string, type = "application/json"): Response {
  const response = new Response(body, { status: 200, headers: { "Content-Type": type } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function fakeFetch(route: (url: URL) => unknown) {
  return vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    const value = route(url);
    if (value instanceof Response) return Promise.resolve(value);
    if (value === undefined) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(typeof value === "string" ? respond(value, url.toString(), "application/rss+xml") : respond(JSON.stringify(value), url.toString()));
  });
}

function client(fetcher: ReturnType<typeof fakeFetch>, perMinute = 20): WebDataClient {
  return new WebDataClient({ perMinute, userAgent: "test", fetcher, now: () => 1_000 });
}

describe("WebDataClient", () => {
  it("defines words from Wiktionary as plain text", async () => {
    const fetcher = fakeFetch((url) => url.pathname.endsWith("/definition/melange")
      ? { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A <a href=\"/wiki/mixture\">mixture</a>." }, { definition: "The <i>spice</i> of Arrakis &amp; more." }, { definition: "Third." }] }] }
      : undefined);
    expect(await client(fetcher).define("Melange")).toEqual({
      word: "melange",
      partOfSpeech: "noun",
      definitions: ["A mixture.", "The spice of Arrakis & more."],
      url: "https://en.wiktionary.org/wiki/melange",
    });
    expect(await client(fetcher).define("<script>")).toBeNull();
  });

  it("reads the weather for a place from Open-Meteo", async () => {
    const fetcher = fakeFetch((url) => {
      if (url.origin === "https://geocoding-api.open-meteo.com") return { results: [{ name: "London", admin1: "England", country: "United Kingdom", latitude: 51.5, longitude: -0.12 }] };
      if (url.origin === "https://api.open-meteo.com") return { current: { temperature_2m: 11.2, apparent_temperature: 9, relative_humidity_2m: 80, weather_code: 61, wind_speed_10m: 20 }, daily: { temperature_2m_max: [13], temperature_2m_min: [6] } };
      return undefined;
    });
    const weather = await client(fetcher).weather("london");
    expect(weather).toMatchObject({ place: "London, England, United Kingdom", temperatureC: 11.2, conditions: "light rain", highC: 13, lowC: 6 });
  });

  it("lists BBC headlines and drops links to other sites", async () => {
    const rss = `<rss><channel><item><title><![CDATA[First story]]></title><link>https://www.bbc.co.uk/news/1</link></item>
      <item><title>Elsewhere</title><link>https://evil.example/x</link></item>
      <item><title>Second &amp; last</title><link>https://www.bbc.com/news/2</link></item></channel></rss>`;
    const fetcher = fakeFetch((url) => (url.origin === "https://feeds.bbci.co.uk" ? rss : undefined));
    expect(await client(fetcher).headlines("technology")).toEqual([
      { title: "First story", url: "https://www.bbc.co.uk/news/1" },
      { title: "Second & last", url: "https://www.bbc.com/news/2" },
    ]);
    expect(String(fetcher.mock.calls[0]![0])).toContain("/technology/");
  });

  it("finds a Steam game with its price and live player count", async () => {
    const fetcher = fakeFetch((url) => {
      if (url.pathname.startsWith("/api/storesearch")) return { items: [{ id: 1172710, name: "Dune: Awakening", price: { final: 4999 } }] };
      if (url.pathname.includes("GetNumberOfCurrentPlayers")) return { response: { player_count: 12345 } };
      return undefined;
    });
    expect(await client(fetcher).steamGame("dune awakening")).toEqual({ id: 1172710, name: "Dune: Awakening", price: "$49.99", url: "https://store.steampowered.com/app/1172710/", players: 12345 });
  });

  it("converts currencies and caches the rate table", async () => {
    const fetcher = fakeFetch((url) => (url.origin === "https://api.frankfurter.app" ? { date: "2026-11-27", rates: { EUR: 0.9, GBP: 0.8 } } : undefined));
    const data = client(fetcher);
    expect(await data.convert(100, "usd", "eur")).toEqual({ amount: 100, from: "USD", to: "EUR", result: 90, date: "2026-11-27" });
    expect((await data.convert(10, "usd", "gbp"))?.result).toBe(8);
    expect(await data.convert(10, "usd", "xyz")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses redirects off the allowed sites and respects the per-minute budget", async () => {
    const redirected = fakeFetch(() => respond(JSON.stringify({ joke: "hi" }), "https://evil.example/joke"));
    await expect(client(redirected).joke()).rejects.toThrow(/redirected/);
    const fetcher = fakeFetch(() => ({ joke: "Why did the sandworm cross the road?" }));
    const limited = client(fetcher, 1);
    expect(await limited.joke()).toBe("Why did the sandworm cross the road?");
    await expect(limited.joke()).rejects.toBeInstanceOf(WebDataBusyError);
  });
});
