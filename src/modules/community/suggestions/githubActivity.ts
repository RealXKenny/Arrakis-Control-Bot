import type { GitHubCommit, GitHubIssue, GitHubRelease } from "../../../infrastructure/http/github/GitHubActivityClient";
import type { SuggestionStatus } from "./suggestionTags";

/**
 * Turns what happens on GitHub into status evidence for suggestions. An open issue means the
 * work is planned, an open or merged pull request or a commit means it is being built, and a
 * published release means it shipped. Everything here is pure so the rules are easy to test.
 */

type WorkKind = "issue" | "pull" | "commit" | "release";
type WorkStatus = Extract<SuggestionStatus, "planned" | "in_progress" | "implemented">;

interface WorkItem {
  /** Stable per repository and item, such as `pull:Owner/Repo:12`. */
  key: string;
  repo: string;
  kind: WorkKind;
  title: string;
  /** Text matched against suggestions. */
  text: string;
  url: string;
  status: WorkStatus;
  /** When the evidence happened: merge, commit or release time, or the last update of open work. */
  at: Date;
  /** Set when the work reached the default branch, so a later release can ship it. */
  mergedAt: Date | null;
  /** Open work describes the present, so it may match a suggestion posted after it started. */
  ongoing: boolean;
}

interface RepositoryActivity {
  issues: readonly GitHubIssue[];
  releases: readonly GitHubRelease[];
  commits: readonly GitHubCommit[];
}

const STATUS_RANK: Readonly<Record<WorkStatus | "under_review", number>> = Object.freeze({ under_review: 0, planned: 1, in_progress: 2, implemented: 3 });
/** Staff decisions the autopilot never overrides. */
const LOCKED_STATUSES: ReadonlySet<SuggestionStatus> = new Set(["back_burner", "not_doing", "implemented"]);
const HOUSEKEEPING = /^(merge (pull request|branch|remote-tracking)|release v?\d|bump |chore\(deps|revert ")/i;
const HIDDEN_LABELS = /^(security|private|internal|confidential|embargoed)$/i;
const MAX_RELEASE_BULLETS = 60;
const MAX_TEXT = 1_500;

function toWorkItems(repo: string, activity: RepositoryActivity): WorkItem[] {
  const items: WorkItem[] = [];
  for (const issue of activity.issues) {
    if (issue.authorIsBot || HOUSEKEEPING.test(issue.title) || issue.labels.some((label) => HIDDEN_LABELS.test(label))) continue;
    const text = `${issue.title}\n${issue.title}\n${firstParagraphs(issue.body)}`;
    if (issue.isPullRequest) {
      if (issue.state === "closed" && !issue.mergedAt) continue;
      const merged = issue.mergedAt;
      items.push({
        key: `pull:${repo}:${issue.number}`, repo, kind: "pull", title: issue.title, text, url: issue.url, status: "in_progress",
        at: merged ?? issue.updatedAt, mergedAt: merged, ongoing: !merged,
      });
    } else if (issue.state === "open") {
      items.push({ key: `issue:${repo}:${issue.number}`, repo, kind: "issue", title: issue.title, text, url: issue.url, status: "planned", at: issue.updatedAt, mergedAt: null, ongoing: true });
    }
  }

  for (const commit of activity.commits) {
    const subject = commit.message.split("\n", 1)[0]?.trim() ?? "";
    // Squash merges end in "(#12)"; the pull request already carries that work.
    if (!subject || commit.authorIsBot || HOUSEKEEPING.test(subject) || /\(#\d+\)$/.test(subject)) continue;
    items.push({
      key: `commit:${repo}:${commit.sha}`, repo, kind: "commit", title: subject.slice(0, 200), text: commit.message.slice(0, MAX_TEXT), url: commit.url,
      status: "in_progress", at: commit.committedAt, mergedAt: commit.committedAt, ongoing: false,
    });
  }

  for (const release of activity.releases) {
    releaseBullets(release.body).forEach((bullet, index) => {
      items.push({
        key: `release:${repo}:${release.tag}:${index}`, repo, kind: "release", title: release.name, text: bullet, url: release.url,
        status: "implemented", at: release.publishedAt, mergedAt: null, ongoing: false,
      });
    });
  }
  return items.sort((left, right) => left.at.getTime() - right.at.getTime());
}

/** Each bullet of release notes is matched on its own, so one release can close many suggestions. */
function releaseBullets(body: string): string[] {
  return body.split(/\r?\n/)
    .map((line) => /^\s{0,3}[-*+]\s+(.*\S)\s*$/.exec(line)?.[1])
    .filter((line): line is string => Boolean(line && line.length >= 12))
    .map((line) => line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").slice(0, MAX_TEXT))
    .slice(0, MAX_RELEASE_BULLETS);
}

/** Suggestion threads that GitHub text names directly, by Discord link or `suggestion: <id>`. */
function referencedThreadIds(text: string, guildId: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(/discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})/g)) if (match[1] === guildId) ids.add(match[2]!);
  for (const match of text.matchAll(/\bsuggestion[\s:#-]+(\d{17,20})\b/gi)) ids.add(match[1]!);
  return [...ids].slice(0, 10);
}

/** Moves only go forward, and never past a status staff chose by hand. */
function canAdvance(current: SuggestionStatus | undefined, target: WorkStatus): boolean {
  if (current && LOCKED_STATUSES.has(current)) return false;
  const rank = current ? STATUS_RANK[current as WorkStatus | "under_review"] ?? 0 : 0;
  return STATUS_RANK[target] > rank;
}

/** Finished work only counts for suggestions posted before it happened; open work also counts later. */
function happenedAfter(item: Pick<WorkItem, "at" | "ongoing">, postedAt: Date): boolean {
  return item.ongoing || item.at.getTime() > postedAt.getTime();
}

function firstParagraphs(body: string): string {
  // Templates and checklists add noise, so only the opening of the description is matched.
  return body.replace(/<!--[\s\S]*?-->/g, "").replace(/```[\s\S]*?```/g, " ").slice(0, MAX_TEXT);
}

export { STATUS_RANK, canAdvance, happenedAfter, referencedThreadIds, releaseBullets, toWorkItems };
export type { RepositoryActivity, WorkItem, WorkKind, WorkStatus };
