import { isRecord } from "../../../shared/validation/isRecord";
import { readBoundedBody } from "../readBoundedBody";

/**
 * Read-only GitHub client for the suggestion autopilot. It only issues GET requests to
 * api.github.com, revalidates with ETags (a 304 costs no rate limit), pauses itself when the
 * rate limit runs low, and validates every field it keeps. The token, when set, is never logged.
 */

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "open" | "closed";
  stateReason: string | null;
  isPullRequest: boolean;
  draft: boolean;
  mergedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  labels: string[];
  authorIsBot: boolean;
}

interface GitHubRelease {
  tag: string;
  name: string;
  body: string;
  url: string;
  publishedAt: Date;
}

interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  committedAt: Date;
  authorIsBot: boolean;
}

interface CachedResponse {
  etag: string;
  value: unknown;
}

const API_ORIGIN = "https://api.github.com";
const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_TEXT = 4_000;
const LOW_RATE_LIMIT = 5;

class GitHubRateLimitedError extends Error {
  public constructor(public readonly resetAt: number) {
    super("GitHub rate limit reached");
    this.name = "GitHubRateLimitedError";
  }
}

class GitHubActivityClient {
  private readonly cache = new Map<string, CachedResponse>();
  private pausedUntil = 0;

  public constructor(
    private readonly token: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  public static isRepository(value: string): boolean {
    return REPOSITORY.test(value) && !value.includes("..");
  }

  /** Recently updated issues and pull requests, newest first. */
  public async issues(repository: string, perPage = 50): Promise<GitHubIssue[]> {
    const value = await this.get(repository, `/issues?state=all&sort=updated&direction=desc&per_page=${perPage}`);
    return Array.isArray(value) ? value.flatMap((entry) => parseIssue(entry)) : [];
  }

  public async releases(repository: string, perPage = 10): Promise<GitHubRelease[]> {
    const value = await this.get(repository, `/releases?per_page=${perPage}`);
    return Array.isArray(value) ? value.flatMap((entry) => parseRelease(entry)) : [];
  }

  /** Recent commits on the default branch. */
  public async commits(repository: string, perPage = 30): Promise<GitHubCommit[]> {
    const value = await this.get(repository, `/commits?per_page=${perPage}`);
    return Array.isArray(value) ? value.flatMap((entry) => parseCommit(entry)) : [];
  }

  public get pausedUntilMs(): number {
    return this.pausedUntil;
  }

  private async get(repository: string, path: string): Promise<unknown> {
    if (!GitHubActivityClient.isRepository(repository)) throw new Error("Invalid GitHub repository name");
    if (this.now() < this.pausedUntil) throw new GitHubRateLimitedError(this.pausedUntil);
    const url = `${API_ORIGIN}/repos/${repository}${path}`;
    const cached = this.cache.get(url);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "arrakis-control-bot",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (cached) headers["If-None-Match"] = cached.etag;

    const response = await this.fetcher(url, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    this.trackRateLimit(response);
    if (response.status === 304 && cached) return cached.value;
    if (response.status === 403 || response.status === 429) {
      const resetAt = this.resetTime(response) ?? this.now() + 15 * 60_000;
      this.pausedUntil = Math.max(this.pausedUntil, resetAt);
      throw new GitHubRateLimitedError(this.pausedUntil);
    }
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    const value: unknown = JSON.parse((await readBoundedBody(response, MAX_RESPONSE_BYTES, "GitHub response too large")).toString("utf8"));
    const etag = response.headers.get("etag");
    if (etag) this.cache.set(url, { etag, value });
    return value;
  }

  private trackRateLimit(response: Response): void {
    const remaining = Number(response.headers.get("x-ratelimit-remaining"));
    // Dev note: Leave a little water in the stillsuit; never drink the rate limit dry.
    if (Number.isFinite(remaining) && remaining <= LOW_RATE_LIMIT) {
      const resetAt = this.resetTime(response);
      if (resetAt) this.pausedUntil = Math.max(this.pausedUntil, resetAt);
    }
  }

  private resetTime(response: Response): number | undefined {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return this.now() + Math.min(retryAfter, 3_600) * 1_000;
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset > 0) return Math.min(reset * 1_000, this.now() + 3_600_000);
    return undefined;
  }
}

function text(value: unknown, maximum = MAX_TEXT): string {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isBotAccount(value: unknown): boolean {
  return isRecord(value) && (value.type === "Bot" || (typeof value.login === "string" && value.login.endsWith("[bot]")));
}

function parseIssue(entry: unknown): GitHubIssue[] {
  if (!isRecord(entry) || !Number.isSafeInteger(entry.number) || typeof entry.title !== "string") return [];
  const url = httpsUrl(entry.html_url);
  const createdAt = date(entry.created_at);
  const updatedAt = date(entry.updated_at);
  if (!url || !createdAt || !updatedAt || (entry.state !== "open" && entry.state !== "closed")) return [];
  const pull = isRecord(entry.pull_request) ? entry.pull_request : null;
  return [{
    number: entry.number as number,
    title: text(entry.title, 300),
    body: text(entry.body),
    url,
    state: entry.state,
    stateReason: typeof entry.state_reason === "string" ? entry.state_reason : null,
    isPullRequest: Boolean(pull),
    draft: entry.draft === true,
    mergedAt: pull ? date(pull.merged_at) : null,
    createdAt,
    updatedAt,
    labels: Array.isArray(entry.labels) ? entry.labels.flatMap((label) => (isRecord(label) && typeof label.name === "string" ? [label.name.slice(0, 50)] : [])).slice(0, 20) : [],
    authorIsBot: isBotAccount(entry.user),
  }];
}

function parseRelease(entry: unknown): GitHubRelease[] {
  if (!isRecord(entry) || entry.draft === true || entry.prerelease === true || typeof entry.tag_name !== "string") return [];
  const url = httpsUrl(entry.html_url);
  const publishedAt = date(entry.published_at);
  if (!url || !publishedAt) return [];
  return [{ tag: text(entry.tag_name, 100), name: text(entry.name, 200) || text(entry.tag_name, 100), body: text(entry.body, 20_000), url, publishedAt }];
}

function parseCommit(entry: unknown): GitHubCommit[] {
  if (!isRecord(entry) || typeof entry.sha !== "string" || !/^[0-9a-f]{40}$/.test(entry.sha) || !isRecord(entry.commit)) return [];
  const url = httpsUrl(entry.html_url);
  const committer = isRecord(entry.commit.committer) ? entry.commit.committer : isRecord(entry.commit.author) ? entry.commit.author : null;
  const committedAt = committer ? date(committer.date) : null;
  if (!url || !committedAt || typeof entry.commit.message !== "string") return [];
  return [{ sha: entry.sha, message: text(entry.commit.message), url, committedAt, authorIsBot: isBotAccount(entry.author) }];
}

export { GitHubActivityClient, GitHubRateLimitedError };
export type { GitHubCommit, GitHubIssue, GitHubRelease };
