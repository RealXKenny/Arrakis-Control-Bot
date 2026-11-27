import type { SuggestionStorage } from "../../../infrastructure/database/suggestions/SuggestionRepository";
import { GitHubRateLimitedError, type GitHubActivityClient } from "../../../infrastructure/http/github/GitHubActivityClient";
import { toWorkItems, type WorkItem } from "./githubActivity";
import type { SuggestionCompanion, SuggestionLogger, SuggestionService } from "./SuggestionService";

interface AutopilotOptions {
  repos: readonly string[];
  intervalMs: number;
  threshold: number;
  /** Most status moves in one pass, so a busy release never floods the forum. */
  maxMoves?: number;
  /** Delay before the first pass after the forum is ready. */
  firstRunDelayMs?: number;
}

type ActivitySource = Pick<GitHubActivityClient, "issues" | "releases" | "commits">;
type AutopilotService = Pick<SuggestionService, "matchWork" | "applyWork">;
type AutopilotStorage = Pick<SuggestionStorage, "unshippedThreadIds">;

interface PassResult {
  moved: number;
  linked: number;
  deferred: number;
}

const DEFAULT_MAX_MOVES = 10;
const SHIP_SCAN_LIMIT = 50;

/**
 * Watches the configured GitHub repositories on a timer and keeps suggestion statuses in step
 * with the work: an open issue plans it, a pull request or commit puts it in progress and a
 * release marks it added. Read-only, cached with ETags and paused while GitHub's rate limit is low.
 */
class SuggestionAutopilot implements SuggestionCompanion {
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private running = false;
  private started = false;
  private stopped = false;
  private rateLimitLogged = 0;

  public constructor(
    private readonly service: AutopilotService,
    private readonly github: ActivitySource,
    private readonly storage: AutopilotStorage,
    private readonly options: Readonly<AutopilotOptions>,
    private readonly logger: SuggestionLogger,
  ) {}

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.first = setTimeout(() => void this.tick(), this.options.firstRunDelayMs ?? 30_000);
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.first.unref();
    this.timer.unref();
    this.logger.info(`Suggestion autopilot watching ${this.options.repos.join(", ")} every ${Math.round(this.options.intervalMs / 60_000)} min.`);
  }

  public stop(): void {
    this.started = false;
    this.stopped = true;
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** One pass over every repository. Overlapping passes are skipped. */
  public async runOnce(): Promise<PassResult> {
    const result: PassResult = { moved: 0, linked: 0, deferred: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const latestRelease = new Map<string, WorkItem>();
      const items: WorkItem[] = [];
      for (const repo of this.options.repos) {
        const [issues, releases, commits] = [await this.github.issues(repo), await this.github.releases(repo), await this.github.commits(repo)];
        const repoItems = toWorkItems(repo, { issues, releases, commits });
        items.push(...repoItems);
        const newest = releases.reduce<(typeof releases)[number] | undefined>((best, release) => (!best || release.publishedAt > best.publishedAt ? release : best), undefined);
        if (newest) {
          latestRelease.set(repo, {
            key: `release:${repo}:${newest.tag}`, repo, kind: "release", title: newest.name, text: newest.body, url: newest.url,
            status: "implemented", at: newest.publishedAt, mergedAt: null, ongoing: false,
          });
        }
      }

      const budget = this.options.maxMoves ?? DEFAULT_MAX_MOVES;
      for (const item of items) {
        if (this.stopped) break;
        for (const match of this.service.matchWork(item, this.options.threshold)) {
          if (result.moved >= budget) {
            result.deferred += 1;
            continue;
          }
          await this.apply(match.threadId, item, match.explicit, result);
        }
      }

      // Work merged before a release went out shipped with it.
      for (const [repo, release] of latestRelease) {
        for (const threadId of await this.storage.unshippedThreadIds(repo, release.at, SHIP_SCAN_LIMIT)) {
          if (this.stopped) break;
          if (result.moved >= budget) {
            result.deferred += 1;
            continue;
          }
          await this.apply(threadId, release, true, result);
        }
      }
      if (result.moved || result.deferred) {
        this.logger.info(`Suggestion autopilot moved ${result.moved} suggestion(s)${result.deferred ? `, ${result.deferred} left for the next pass` : ""}.`);
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async apply(threadId: string, item: WorkItem, explicit: boolean, result: PassResult): Promise<void> {
    try {
      const outcome = await this.service.applyWork(threadId, item, explicit);
      if (outcome === "moved") result.moved += 1;
      else if (outcome === "linked") result.linked += 1;
    } catch (error: unknown) {
      this.logger.warn(`Suggestion autopilot could not update ${threadId}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error: unknown) {
      if (error instanceof GitHubRateLimitedError) {
        // One line per pause; the client already refuses requests until GitHub resets.
        if (this.rateLimitLogged !== error.resetAt) this.logger.warn(`GitHub rate limit is low; the suggestion autopilot resumes after ${new Date(error.resetAt).toISOString()}. Set SUGGESTIONS_GITHUB_TOKEN for a higher limit.`);
        this.rateLimitLogged = error.resetAt;
        return;
      }
      this.logger.warn(`Suggestion autopilot pass failed. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export { SuggestionAutopilot };
export type { AutopilotOptions, PassResult };
