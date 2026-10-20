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
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`, {
    headers, signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${repository} GitHub releases: ${response.status} ${response.statusText}`);
  }
  const releases: unknown = await response.json();
  if (!Array.isArray(releases)) throw new Error(`Invalid GitHub release list for ${repository}.`);
  return releases as GitHubRelease[];
}

export { fetchGitHubReleases };
export type { GitHubRelease };
