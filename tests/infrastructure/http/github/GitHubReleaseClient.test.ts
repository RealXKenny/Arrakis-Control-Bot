import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubReleases } from "../../../../src/infrastructure/http/github/GitHubReleaseClient";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub release transport", () => {
  it("authenticates only against the GitHub API and disallows redirects", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetch);
    await fetchGitHubReleases("owner/repo", "test-github-token");
    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo/releases?per_page=100", expect.objectContaining({
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Arrakis-Control", Authorization: "Bearer test-github-token" },
      redirect: "error", signal: expect.any(AbortSignal),
    }));
  });

  it("keeps public access available without sending a blank authorization header", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetch);
    await fetchGitHubReleases("owner/repo");
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it.each([401, 403, 429])("reports HTTP %s without including credentials", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, statusText: "Unavailable" }));
    const operation = fetchGitHubReleases("owner/repo", "test-github-token");
    await expect(operation).rejects.toThrow(`GitHub releases: ${status}`);
    await expect(operation).rejects.not.toThrow("test-github-token");
  });

  it("rejects an invalid release list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: "not a list" }) }));
    await expect(fetchGitHubReleases("owner/repo")).rejects.toThrow("Invalid GitHub release list");
  });
});
