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
}

const DISCORD_ID = /^\d{17,20}$/;

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
  });
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
