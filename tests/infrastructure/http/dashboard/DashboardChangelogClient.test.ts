import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardChangelogClient } from "../../../../src/infrastructure/http/dashboard/DashboardChangelogClient";

const payload = { schemaVersion: 1, generatedAt: "2026-11-16T00:00:00Z", releases: [
  { project: "bot", id: "bot:1.2.3", version: "1.2.3", title: "Bot release", date: null, sections: [{ title: "Fixed", items: ["A fix"] }] },
] };
afterEach(() => vi.unstubAllGlobals());

describe("dashboard changelog client", () => {
  it("requires an HTTPS origin without credentials", () => {
    for (const url of ["http://example.test", "https://user:pass@example.test", "https://example.test/path"]) {
      expect(() => new DashboardChangelogClient(url)).toThrow();
    }
  });

  it("validates and caches results while sharing concurrent requests", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload))));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DashboardChangelogClient("https://example.test");
    const [first, second] = await Promise.all([client.getReleases(), client.getReleases()]);
    expect(first.releases[0].id).toBe("bot:1.2.3");
    expect(second.stale).toBe(false);
    await client.getReleases();
    expect(fetchMock).toHaveBeenCalledOnce();
    await client.getReleases(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks last-known-good data stale on outage, then expires it", async () => {
    let now = 0;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload))).mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DashboardChangelogClient("https://example.test", () => now);
    await client.getReleases();
    now = 300_001;
    expect((await client.getReleases()).stale).toBe(true);
    now = 86_400_001;
    await expect(client.getReleases()).rejects.toThrow("temporarily unavailable");
  });

  it("rejects malformed and oversized data without caching it", async () => {
    let now = 0;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, releases: [{ ...payload.releases[0], id: "bot:wrong" }] })))
      .mockResolvedValueOnce(new Response("x".repeat(1_000_001)));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DashboardChangelogClient("https://example.test", () => now);
    await expect(client.getReleases()).rejects.toThrow("temporarily unavailable");
    await expect(client.getReleases()).rejects.toThrow("temporarily unavailable");
    expect(fetchMock).toHaveBeenCalledOnce();
    now = 30_001;
    await expect(client.getReleases()).rejects.toThrow("temporarily unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
