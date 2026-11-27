import { describe, expect, it, vi } from "vitest";
import { WebLookupBusyError, WebLookupClient, firstParagraph, matchScore } from "../../../../src/infrastructure/http/web/WebLookupClient";

function json(value: unknown, url: string): Response {
  const response = new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

type Route = (url: URL) => unknown;

function fakeFetch(route: Route) {
  return vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    const value = route(url);
    if (value instanceof Response) return Promise.resolve(value);
    return Promise.resolve(value === undefined ? new Response("not found", { status: 404 }) : json(value, url.toString()));
  });
}

const WIKI = "https://wiki.example";

describe("WebLookupClient", () => {
  it("answers from the game wiki first, with a link", async () => {
    const fetcher = fakeFetch((url) => {
      if (url.origin !== WIKI) return undefined;
      if (url.searchParams.get("list") === "search") return { query: { search: [{ title: "Stillsuit" }] } };
      if (url.searchParams.get("action") === "parse") return { parse: { text: { "*": '<aside class="portable-infobox">Box</aside><p>Short.</p><p>A <b>stillsuit</b> is a body suit that recycles the wearer&#39;s water so they can survive the deep desert.[1]</p>' } } };
      return undefined;
    });
    const client = new WebLookupClient({ wikiUrl: WIKI, wikiName: "Dune Wiki", perMinute: 10, userAgent: "test", fetcher });
    const answer = await client.lookup("stillsuit");
    expect(answer).toEqual({
      title: "Stillsuit",
      summary: "A stillsuit is a body suit that recycles the wearer's water so they can survive the deep desert.",
      url: `${WIKI}/wiki/Stillsuit`,
      source: "Dune Wiki",
    });
    expect(fetcher.mock.calls.every(([input]) => new URL(String(input)).origin === WIKI)).toBe(true);
  });

  it("falls back to DuckDuckGo, then Wikipedia, and caches results", async () => {
    const fetcher = fakeFetch((url) => {
      if (url.origin === "https://api.duckduckgo.com") {
        expect(url.searchParams.get("kp")).toBe("1");
        return {};
      }
      if (url.origin === "https://en.wikipedia.org" && url.pathname === "/w/api.php") return { query: { search: [{ title: "Frank Herbert" }] } };
      if (url.pathname.startsWith("/api/rest_v1/page/summary/")) return { title: "Frank Herbert", extract: "Frank Herbert was an American science fiction author best known for Dune.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Frank_Herbert" } } };
      return undefined;
    });
    const client = new WebLookupClient({ perMinute: 10, userAgent: "test", fetcher });
    const answer = await client.lookup("frank herbert");
    expect(answer?.source).toBe("Wikipedia");
    expect(answer?.url).toBe("https://en.wikipedia.org/wiki/Frank_Herbert");
    const calls = fetcher.mock.calls.length;
    await client.lookup("Frank Herbert");
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it("refuses blocked topics, off-site redirects and too many lookups", async () => {
    const fetcher = fakeFetch((url) => json({ AbstractText: "Redirected text that is long enough to count." }, `https://evil.example${url.pathname}`));
    const client = new WebLookupClient({ perMinute: 2, userAgent: "test", fetcher, now: () => 0 });
    expect(await client.lookup("nsfw pictures")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await client.lookup("sandworm")).toBeNull();
    await client.lookup("spice");
    await expect(client.lookup("melange")).rejects.toBeInstanceOf(WebLookupBusyError);
  });

  it("only accepts https wiki URLs", () => {
    expect(() => WebLookupClient.parseWikiUrl("http://127.0.0.1")).toThrow();
    expect(() => WebLookupClient.parseWikiUrl("https://a:b@wiki.example")).toThrow();
    expect(WebLookupClient.parseWikiUrl("https://wiki.example/")).toBe("https://wiki.example");
  });

  it("only accepts pages that are about the subject", async () => {
    const fetcher = fakeFetch((url) => {
      if (url.origin === "https://api.duckduckgo.com") return { Heading: "YouTube", AbstractText: "YouTube is an American video-sharing platform owned by Google." };
      if (url.pathname === "/w/api.php") {
        return url.searchParams.get("srsearch") === "ishowspeed youtube"
          ? { query: { search: [{ title: "List of most-subscribed YouTube channels" }, { title: "YouTube" }] } }
          : { query: { search: [{ title: "IShowSpeed" }] } };
      }
      if (url.pathname === "/api/rest_v1/page/summary/IShowSpeed") return { title: "IShowSpeed", extract: "Darren Jason Watkins Jr., known online as IShowSpeed, is an American YouTuber and online streamer. He is known for his energetic livestreams. He was born in 2005." };
      return undefined;
    });
    const client = new WebLookupClient({ perMinute: 10, userAgent: "test", fetcher });
    const answer = await client.lookup("ishowspeed", "youtube");
    expect(answer?.title).toBe("IShowSpeed");
    expect(answer?.summary).toBe("Darren Jason Watkins Jr., known online as IShowSpeed, is an American YouTuber and online streamer. He is known for his energetic livestreams.");
  });

  it("scores how well a title covers the subject and reads the first paragraph", () => {
    expect(matchScore("paul atreides", "Paul Atreides")).toBe(1);
    expect(matchScore("ishowspeed", "List of most-subscribed YouTube channels")).toBe(0);
    expect(matchScore("ishowspeed", "YouTube")).toBe(0);
    expect(matchScore("i show speed", "IShowSpeed")).toBe(1);
    expect(matchScore("ksi", "KSI")).toBe(1);
    expect(matchScore("coriolis storm", "Coriolis Storm (Dune)")).toBe(1);
    expect(matchScore("spice", "Spice melange")).toBe(1);
    expect(firstParagraph("<table><p>in a table, ignore this paragraph please, it is long enough</p></table><p>Hi</p>")).toBeNull();
  });
});
