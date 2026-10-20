interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  created_at: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

async function fetchGitHubReleases(repository: string, token?: string): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Arrakis-Control",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const releases: GitHubRelease[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100${page === 1 ? "" : `&page=${page}`}`, {
      headers, signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${repository} GitHub releases: ${response.status} ${response.statusText}`);
    }
    const batch: unknown = await response.json();
    if (!Array.isArray(batch)) throw new Error(`Invalid GitHub release list for ${repository}.`);
    releases.push(...batch as GitHubRelease[]);
    if (batch.length < 100) return releases;
  }
}

export { fetchGitHubReleases };
export type { GitHubRelease };
