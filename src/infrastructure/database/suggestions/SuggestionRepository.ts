import type { Pool, QueryResultRow } from "pg";

interface SuggestionPost {
  threadId: string;
  guildId: string;
  forumId: string;
  authorId: string | null;
  title: string;
  body: string;
  tagIds: string[];
  panelMessageId: string | null;
  createdAt: Date;
}

interface SuggestionFeature {
  /** BIGSERIAL kept as a decimal string. */
  id: string;
  guildId: string;
  name: string;
  keywords: string;
  referenceUrl: string | null;
  status: "in_progress" | "implemented";
  createdBy: string;
  createdAt: Date;
  implementedAt: Date | null;
  linkedCount: number;
}

interface SuggestionStorage {
  initialize(): Promise<void>;
  listPosts(guildId: string, forumId: string, limit: number): Promise<SuggestionPost[]>;
  upsertPost(post: SuggestionPost): Promise<void>;
  updatePostTags(threadId: string, tagIds: readonly string[]): Promise<void>;
  updatePanelMessage(threadId: string, messageId: string | null): Promise<void>;
  deletePost(threadId: string): Promise<void>;
  createFeature(guildId: string, name: string, keywords: string, referenceUrl: string | null, createdBy: string): Promise<SuggestionFeature>;
  feature(guildId: string, featureId: string): Promise<SuggestionFeature | null>;
  listFeatures(guildId: string, query: string, limit: number): Promise<SuggestionFeature[]>;
  linkThreads(featureId: string, threadIds: readonly string[], linkedBy: string): Promise<void>;
  linkedThreadIds(featureId: string): Promise<string[]>;
  featureForThread(guildId: string, threadId: string): Promise<SuggestionFeature | null>;
  markImplemented(guildId: string, featureId: string, referenceUrl: string | null): Promise<SuggestionFeature | null>;
}

interface PostRow extends QueryResultRow {
  thread_id: string;
  guild_id: string;
  forum_id: string;
  author_id: string | null;
  title: string;
  body: string;
  tag_ids: string[] | null;
  panel_message_id: string | null;
  created_at: Date | string;
}

interface FeatureRow extends QueryResultRow {
  id: string | number;
  guild_id: string;
  name: string;
  keywords: string;
  reference_url: string | null;
  status: string;
  created_by: string;
  created_at: Date | string;
  implemented_at: Date | string | null;
  linked_count?: string | number;
}

const MAX_BODY_LENGTH = 4_000;
const FEATURE_ID_PATTERN = /^\d{1,18}$/;
const FEATURE_COLUMNS = `f.id, f.guild_id, f.name, f.keywords, f.reference_url, f.status, f.created_by, f.created_at, f.implemented_at,
  (SELECT COUNT(*) FROM suggestion_feature_links l WHERE l.feature_id = f.id) AS linked_count`;

class SuggestionRepository implements SuggestionStorage {
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS suggestion_posts (
        thread_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        forum_id TEXT NOT NULL,
        author_id TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        tag_ids TEXT[] NOT NULL DEFAULT '{}',
        panel_message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS suggestion_posts_forum ON suggestion_posts (guild_id, forum_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS suggestion_features (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        keywords TEXT NOT NULL DEFAULT '',
        reference_url TEXT,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'implemented')),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        implemented_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS suggestion_features_guild ON suggestion_features (guild_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS suggestion_feature_links (
        feature_id BIGINT NOT NULL REFERENCES suggestion_features(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        linked_by TEXT NOT NULL,
        linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (feature_id, thread_id)
      );
      CREATE INDEX IF NOT EXISTS suggestion_feature_links_thread ON suggestion_feature_links (thread_id);
    `);
  }

  public async listPosts(guildId: string, forumId: string, limit: number): Promise<SuggestionPost[]> {
    const result = await this.pool.query<PostRow>(
      `SELECT thread_id, guild_id, forum_id, author_id, title, body, tag_ids, panel_message_id, created_at
       FROM suggestion_posts WHERE guild_id = $1 AND forum_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [guildId, forumId, limit],
    );
    return result.rows.map(mapPost);
  }

  public async upsertPost(post: SuggestionPost): Promise<void> {
    await this.pool.query(
      `INSERT INTO suggestion_posts (thread_id, guild_id, forum_id, author_id, title, body, tag_ids, panel_message_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (thread_id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, tag_ids = EXCLUDED.tag_ids,
         panel_message_id = COALESCE(EXCLUDED.panel_message_id, suggestion_posts.panel_message_id), updated_at = NOW()`,
      [post.threadId, post.guildId, post.forumId, post.authorId, post.title.slice(0, 200), post.body.slice(0, MAX_BODY_LENGTH), post.tagIds, post.panelMessageId, post.createdAt],
    );
  }

  public async updatePostTags(threadId: string, tagIds: readonly string[]): Promise<void> {
    await this.pool.query("UPDATE suggestion_posts SET tag_ids = $2, updated_at = NOW() WHERE thread_id = $1", [threadId, [...tagIds]]);
  }

  public async updatePanelMessage(threadId: string, messageId: string | null): Promise<void> {
    await this.pool.query("UPDATE suggestion_posts SET panel_message_id = $2, updated_at = NOW() WHERE thread_id = $1", [threadId, messageId]);
  }

  public async deletePost(threadId: string): Promise<void> {
    await this.pool.query("DELETE FROM suggestion_posts WHERE thread_id = $1", [threadId]);
  }

  public async createFeature(guildId: string, name: string, keywords: string, referenceUrl: string | null, createdBy: string): Promise<SuggestionFeature> {
    const result = await this.pool.query<FeatureRow>(
      `INSERT INTO suggestion_features (guild_id, name, keywords, reference_url, created_by) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, guild_id, name, keywords, reference_url, status, created_by, created_at, implemented_at, 0 AS linked_count`,
      [guildId, name, keywords, referenceUrl, createdBy],
    );
    return mapFeature(result.rows[0]!);
  }

  public async feature(guildId: string, featureId: string): Promise<SuggestionFeature | null> {
    if (!FEATURE_ID_PATTERN.test(featureId)) return null;
    const result = await this.pool.query<FeatureRow>(`SELECT ${FEATURE_COLUMNS} FROM suggestion_features f WHERE f.guild_id = $1 AND f.id = $2`, [guildId, featureId]);
    return result.rows[0] ? mapFeature(result.rows[0]) : null;
  }

  public async listFeatures(guildId: string, query: string, limit: number): Promise<SuggestionFeature[]> {
    const result = await this.pool.query<FeatureRow>(
      `SELECT ${FEATURE_COLUMNS} FROM suggestion_features f
       WHERE f.guild_id = $1 AND ($2 = '' OR f.name ILIKE '%' || $2 || '%')
       ORDER BY (f.status = 'in_progress') DESC, f.created_at DESC LIMIT $3`,
      [guildId, escapeLike(query), limit],
    );
    return result.rows.map(mapFeature);
  }

  public async linkThreads(featureId: string, threadIds: readonly string[], linkedBy: string): Promise<void> {
    if (!FEATURE_ID_PATTERN.test(featureId) || threadIds.length === 0) return;
    await this.pool.query(
      `INSERT INTO suggestion_feature_links (feature_id, thread_id, linked_by)
       SELECT $1, thread_id, $3 FROM UNNEST($2::text[]) AS thread_id ON CONFLICT DO NOTHING`,
      [featureId, [...threadIds], linkedBy],
    );
  }

  public async linkedThreadIds(featureId: string): Promise<string[]> {
    if (!FEATURE_ID_PATTERN.test(featureId)) return [];
    const result = await this.pool.query<{ thread_id: string }>("SELECT thread_id FROM suggestion_feature_links WHERE feature_id = $1 ORDER BY linked_at", [featureId]);
    return result.rows.map((row) => row.thread_id);
  }

  public async featureForThread(guildId: string, threadId: string): Promise<SuggestionFeature | null> {
    const result = await this.pool.query<FeatureRow>(
      `SELECT ${FEATURE_COLUMNS} FROM suggestion_features f JOIN suggestion_feature_links link ON link.feature_id = f.id
       WHERE f.guild_id = $1 AND link.thread_id = $2 ORDER BY link.linked_at DESC LIMIT 1`,
      [guildId, threadId],
    );
    return result.rows[0] ? mapFeature(result.rows[0]) : null;
  }

  public async markImplemented(guildId: string, featureId: string, referenceUrl: string | null): Promise<SuggestionFeature | null> {
    if (!FEATURE_ID_PATTERN.test(featureId)) return null;
    const result = await this.pool.query<FeatureRow>(
      `UPDATE suggestion_features f SET status = 'implemented', implemented_at = COALESCE(f.implemented_at, NOW()), reference_url = COALESCE($3, f.reference_url)
       WHERE f.guild_id = $1 AND f.id = $2 RETURNING ${FEATURE_COLUMNS}`,
      [guildId, featureId, referenceUrl],
    );
    return result.rows[0] ? mapFeature(result.rows[0]) : null;
  }
}

function escapeLike(value: string): string {
  return value.trim().slice(0, 100).replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapPost(row: PostRow): SuggestionPost {
  return {
    threadId: row.thread_id,
    guildId: row.guild_id,
    forumId: row.forum_id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    tagIds: Array.isArray(row.tag_ids) ? row.tag_ids.filter((id): id is string => typeof id === "string") : [],
    panelMessageId: row.panel_message_id,
    createdAt: toDate(row.created_at),
  };
}

function mapFeature(row: FeatureRow): SuggestionFeature {
  return {
    id: String(row.id),
    guildId: row.guild_id,
    name: row.name,
    keywords: row.keywords,
    referenceUrl: row.reference_url,
    status: row.status === "implemented" ? "implemented" : "in_progress",
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    implementedAt: row.implemented_at === null ? null : toDate(row.implemented_at),
    linkedCount: Number(row.linked_count ?? 0),
  };
}

export { SuggestionRepository };
export type { SuggestionFeature, SuggestionPost, SuggestionStorage };
