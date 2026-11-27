interface SuggestionConfig {
  guildId: string;
  forumChannelId: string;
  /** Add category and Under Review tags to new posts that have none. */
  autoTag: boolean;
  /** Post the assistant reply with the staff status panel under each new post. */
  panel: boolean;
  /** Mention the suggester when staff change the status. */
  notifyAuthor: boolean;
  /** Create missing status tags (Planned, Back Burner, Not Doing, ...) at startup. */
  createMissingTags: boolean;
  /** Cosine similarity from 0 to 1 for "possibly related" posts. */
  duplicateThreshold: number;
  /** Post a discussion summary every N replies in a post. 0 turns automatic summaries off. */
  autoSummaryMessages: number;
  /** Most older posts read from Discord into the index at startup. */
  backfillLimit: number;
  /** Post the assistant panel and missing tags under older posts once, without pinging anyone. */
  catchUp: boolean;
  /** Read the GitHub repositories and move statuses without staff input. */
  autopilot: boolean;
  /** `owner/name` repositories the autopilot reads. */
  githubRepos: readonly string[];
  githubIntervalMinutes: number;
  /** Cosine similarity from 0 to 1 a GitHub item needs before it moves a suggestion. */
  autopilotThreshold: number;
}

const DISCORD_ID = /^\d{17,20}$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const DEFAULT_GITHUB_REPOS = ["RealXKenny/Arrakis-Control-Bot", "RealXKenny/Arrakis-Control-Dashboard"];

function loadSuggestionConfig(env: NodeJS.ProcessEnv): SuggestionConfig | undefined {
  const forumChannelId = env.SUGGESTIONS_FORUM_CHANNEL_ID?.trim();
  if (!forumChannelId) return undefined;
  const guildId = env.GUILD_ID?.trim();
  if (!guildId || !DISCORD_ID.test(guildId)) throw new Error("GUILD_ID must be a valid Discord ID when the suggestion assistant is enabled.");
  if (!DISCORD_ID.test(forumChannelId)) throw new Error("SUGGESTIONS_FORUM_CHANNEL_ID must be a valid Discord forum channel ID.");

  return Object.freeze({
    guildId,
    forumChannelId,
    autoTag: parseFlag(env.SUGGESTIONS_AUTO_TAG, true, "SUGGESTIONS_AUTO_TAG"),
    panel: parseFlag(env.SUGGESTIONS_STATUS_PANEL, true, "SUGGESTIONS_STATUS_PANEL"),
    notifyAuthor: parseFlag(env.SUGGESTIONS_NOTIFY_AUTHOR, true, "SUGGESTIONS_NOTIFY_AUTHOR"),
    createMissingTags: parseFlag(env.SUGGESTIONS_CREATE_TAGS, true, "SUGGESTIONS_CREATE_TAGS"),
    duplicateThreshold: parseRange(env.SUGGESTIONS_DUPLICATE_THRESHOLD, 0.35, 0.1, 0.95, "SUGGESTIONS_DUPLICATE_THRESHOLD"),
    autoSummaryMessages: parseInteger(env.SUGGESTIONS_AUTO_SUMMARY_MESSAGES, 50, 0, 1_000, "SUGGESTIONS_AUTO_SUMMARY_MESSAGES"),
    backfillLimit: parseInteger(env.SUGGESTIONS_BACKFILL_LIMIT, 500, 0, 5_000, "SUGGESTIONS_BACKFILL_LIMIT"),
    catchUp: parseFlag(env.SUGGESTIONS_CATCHUP, true, "SUGGESTIONS_CATCHUP"),
    autopilot: parseFlag(env.SUGGESTIONS_AUTOPILOT, true, "SUGGESTIONS_AUTOPILOT"),
    githubRepos: Object.freeze(parseRepositories(env.SUGGESTIONS_GITHUB_REPOS)),
    githubIntervalMinutes: parseInteger(env.SUGGESTIONS_GITHUB_INTERVAL_MINUTES, 15, 5, 1_440, "SUGGESTIONS_GITHUB_INTERVAL_MINUTES"),
    autopilotThreshold: parseRange(env.SUGGESTIONS_AUTOPILOT_THRESHOLD, 0.3, 0.1, 0.95, "SUGGESTIONS_AUTOPILOT_THRESHOLD"),
  });
}

function parseRepositories(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [...DEFAULT_GITHUB_REPOS];
  const repositories = [...new Set(trimmed.split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (repositories.length > 10 || repositories.some((entry) => !GITHUB_REPOSITORY.test(entry) || entry.includes(".."))) {
    throw new Error("SUGGESTIONS_GITHUB_REPOS must be up to 10 comma-separated owner/name repositories.");
  }
  return repositories;
}

function parseFlag(value: string | undefined, fallback: boolean, name: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function parseRange(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be a number from ${minimum} to ${maximum}.`);
  return parsed;
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const parsed = parseRange(value, fallback, minimum, maximum, name);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`);
  return parsed;
}

export { loadSuggestionConfig };
export type { SuggestionConfig };
