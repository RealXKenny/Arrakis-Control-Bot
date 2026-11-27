import { describe, expect, it, vi } from "vitest";
import { GitHubActivityClient, GitHubRateLimitedError } from "../../../../src/infrastructure/http/github/GitHubActivityClient";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const issue = { number: 4, title: "Spice tracker", body: "b", html_url: "https://github.com/o/r/pull/4", state: "closed", pull_request: { merged_at: "2026-11-20T00:00:00Z" }, created_at: "2026-11-19T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", labels: [{ name: "roadmap" }], user: { login: "kenny", type: "User" } };

describe("GitHubActivityClient", () => {
  it("only sends GET requests to api.github.com, with the token and without following redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([issue]));
    const [parsed] = await new GitHubActivityClient("secret", fetcher).issues("o/r");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.github.com/repos/o/r/issues?state=all&sort=updated&direction=desc&per_page=50");
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(parsed).toMatchObject({ number: 4, isPullRequest: true, labels: ["roadmap"], authorIsBot: false });
    expect(parsed?.mergedAt).toEqual(new Date("2026-11-20T00:00:00Z"));
  });

  it("revalidates with the ETag and reuses the cached body on 304", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([issue], 200, { etag: "\"v1\"" })).mockResolvedValueOnce(json(null, 304));
    const client = new GitHubActivityClient(undefined, fetcher);
    await client.issues("o/r");
    await expect(client.issues("o/r")).resolves.toHaveLength(1);
    const headers = (fetcher.mock.calls[1]?.[1] as { headers: Record<string, string> }).headers;
    expect(headers["If-None-Match"]).toBe("\"v1\"");
    expect(headers.Authorization).toBeUndefined();
  });

  it("pauses until the reset time when the rate limit runs out", async () => {
    let now = 1_000_000;
    const fetcher = vi.fn().mockResolvedValue(json({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1060" }));
    const client = new GitHubActivityClient(undefined, fetcher, () => now);
    await expect(client.releases("o/r")).rejects.toBeInstanceOf(GitHubRateLimitedError);
    await expect(client.commits("o/r")).rejects.toBeInstanceOf(GitHubRateLimitedError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.pausedUntilMs).toBe(1_060_000);
    now = 1_060_001;
    fetcher.mockResolvedValue(json([]));
    await expect(client.commits("o/r")).resolves.toEqual([]);
  });

  it("rejects bad repository names and drops unsafe or incomplete entries", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([
      { tag_name: "v1", name: "v1", body: "- a", html_url: "https://evil.example/r", published_at: "2026-11-20T00:00:00Z" },
      { tag_name: "v2", draft: true, html_url: "https://github.com/o/r/releases/v2", published_at: "2026-11-20T00:00:00Z" },
      { tag_name: "v3", name: "", body: "- shipped", html_url: "https://github.com/o/r/releases/v3", published_at: "2026-11-21T00:00:00Z" },
    ]));
    const client = new GitHubActivityClient(undefined, fetcher);
    await expect(client.issues("../etc")).rejects.toThrow("Invalid GitHub repository");
    await expect(client.releases("o/r")).resolves.toEqual([{ tag: "v3", name: "v3", body: "- shipped", url: "https://github.com/o/r/releases/v3", publishedAt: new Date("2026-11-21T00:00:00Z") }]);
  });
});
