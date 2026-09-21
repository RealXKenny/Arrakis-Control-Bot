import type { Pool, QueryResultRow } from "pg";
import { MAX_STORED_XP } from "../../../modules/community/leveling/levelProgress";

interface LevelProfile {
  guildId: string;
  userId: string;
  xp: number;
  messageCount: number;
  voiceMinutes: number;
  lastAwardedAt: Date | null;
  rank: number | null;
}

interface LevelRow extends QueryResultRow {
  guild_id: string;
  user_id: string;
  xp: string | number;
  message_count: string | number;
  voice_minutes: string | number;
  last_awarded_at: Date | string | null;
  rank?: string | number;
}

interface LevelEvent {
  guildId: string;
  startsAt: Date;
  endsAt: Date;
  createdBy: string;
}

interface LevelEventRow extends QueryResultRow {
  guild_id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  created_by: string;
}

interface LevelStorage {
  initialize(): Promise<void>;
  awardMessageXp(guildId: string, userId: string, xp: number, cooldownMs: number, fingerprint: string, repeatWindowMs: number): Promise<LevelProfile | null>;
  awardVoiceXp(guildId: string, userId: string, xp: number, cooldownMs: number): Promise<LevelProfile | null>;
  profile(guildId: string, userId: string): Promise<LevelProfile>;
  leaderboard(guildId: string, limit: number): Promise<LevelProfile[]>;
  claimAchievements(guildId: string, userId: string, achievementIds: readonly string[]): Promise<string[]>;
  scheduleEvent(guildId: string, startsAt: Date, endsAt: Date, createdBy: string): Promise<LevelEvent>;
  upcomingEvent(guildId: string): Promise<LevelEvent | null>;
  stopEvent(guildId: string): Promise<boolean>;
}

class LevelRepository implements LevelStorage {
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS community_levels (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp BIGINT NOT NULL DEFAULT 0 CHECK (xp BETWEEN 0 AND ${MAX_STORED_XP}),
        message_count BIGINT NOT NULL DEFAULT 0 CHECK (message_count >= 0),
        voice_minutes BIGINT NOT NULL DEFAULT 0 CHECK (voice_minutes >= 0),
        last_awarded_at TIMESTAMPTZ,
        last_message_fingerprint TEXT,
        last_voice_awarded_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS community_levels_leaderboard
        ON community_levels (guild_id, xp DESC, user_id);
      ALTER TABLE community_levels
        ADD COLUMN IF NOT EXISTS voice_minutes BIGINT NOT NULL DEFAULT 0 CHECK (voice_minutes >= 0),
        ADD COLUMN IF NOT EXISTS last_voice_awarded_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_message_fingerprint TEXT;
      CREATE TABLE IF NOT EXISTS community_level_events (
        guild_id TEXT PRIMARY KEY,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        created_by TEXT NOT NULL,
        CHECK (ends_at > starts_at)
      );
      CREATE TABLE IF NOT EXISTS community_level_achievements (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id, achievement_id)
      );
    `);
  }

  public async awardMessageXp(guildId: string, userId: string, xp: number, cooldownMs: number, fingerprint: string, repeatWindowMs: number): Promise<LevelProfile | null> {
    // Dev note: PostgreSQL guards the spice cupboard because two shards claiming prescience is how timelines split.
    const result = await this.pool.query<LevelRow>(
      `INSERT INTO community_levels (guild_id, user_id, xp, message_count, last_awarded_at, last_message_fingerprint)
       VALUES ($1, $2, $3, 1, NOW(), $5)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         xp = LEAST(community_levels.xp + EXCLUDED.xp, ${MAX_STORED_XP}),
         message_count = community_levels.message_count + 1,
         last_awarded_at = NOW(),
         last_message_fingerprint = EXCLUDED.last_message_fingerprint,
         updated_at = NOW()
       WHERE community_levels.last_awarded_at IS NULL
          OR (community_levels.last_awarded_at <= NOW() - ($4 * INTERVAL '1 millisecond')
              AND (community_levels.last_message_fingerprint IS DISTINCT FROM EXCLUDED.last_message_fingerprint
                   OR community_levels.last_awarded_at <= NOW() - ($6 * INTERVAL '1 millisecond')))
       RETURNING guild_id, user_id, xp, message_count, voice_minutes, last_awarded_at`,
      [guildId, userId, xp, cooldownMs, fingerprint, repeatWindowMs],
    );

    return result.rows[0] ? mapLevelRow(result.rows[0], null) : null;
  }

  public async awardVoiceXp(guildId: string, userId: string, xp: number, cooldownMs: number): Promise<LevelProfile | null> {
    const result = await this.pool.query<LevelRow>(
      `INSERT INTO community_levels (guild_id, user_id, xp, voice_minutes, last_voice_awarded_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         xp = LEAST(community_levels.xp + EXCLUDED.xp, ${MAX_STORED_XP}),
         voice_minutes = community_levels.voice_minutes + 1,
         last_voice_awarded_at = NOW(),
         updated_at = NOW()
       WHERE community_levels.last_voice_awarded_at IS NULL
          OR community_levels.last_voice_awarded_at <= NOW() - ($4 * INTERVAL '1 millisecond')
       RETURNING guild_id, user_id, xp, message_count, voice_minutes, last_awarded_at`,
      [guildId, userId, xp, cooldownMs],
    );

    return result.rows[0] ? mapLevelRow(result.rows[0], null) : null;
  }

  public async profile(guildId: string, userId: string): Promise<LevelProfile> {
    const result = await this.pool.query<LevelRow>(
      `WITH ranked AS (
         SELECT guild_id, user_id, xp, message_count, voice_minutes, last_awarded_at,
                RANK() OVER (ORDER BY xp DESC) AS rank
         FROM community_levels
         WHERE guild_id = $1
       )
       SELECT * FROM ranked WHERE user_id = $2`,
      [guildId, userId],
    );

    return result.rows[0]
      ? mapLevelRow(result.rows[0], parseInteger(result.rows[0].rank ?? 0, "rank"))
      : { guildId, userId, xp: 0, messageCount: 0, voiceMinutes: 0, lastAwardedAt: null, rank: null };
  }

  public async leaderboard(guildId: string, limit: number): Promise<LevelProfile[]> {
    // Dev note: Ties share a rank. The Landsraad insisted, and the database had no objections.
    const result = await this.pool.query<LevelRow>(
      `SELECT guild_id, user_id, xp, message_count, voice_minutes, last_awarded_at,
              RANK() OVER (ORDER BY xp DESC) AS rank
       FROM community_levels
       WHERE guild_id = $1
       ORDER BY xp DESC, user_id
       LIMIT $2`,
      [guildId, limit],
    );

    return result.rows.map((row) => mapLevelRow(row, parseInteger(row.rank ?? 0, "rank")));
  }

  public async claimAchievements(guildId: string, userId: string, achievementIds: readonly string[]): Promise<string[]> {
    if (achievementIds.length === 0) return [];
    // Dev note: ON CONFLICT keeps two enthusiastic shards from awarding the same shiny desert sticker.
    const result = await this.pool.query<{ achievement_id: string }>(
      `INSERT INTO community_level_achievements (guild_id, user_id, achievement_id)
       SELECT $1, $2, achievement_id
       FROM UNNEST($3::text[]) AS achievement_id
       ON CONFLICT (guild_id, user_id, achievement_id) DO NOTHING
       RETURNING achievement_id`,
      [guildId, userId, achievementIds],
    );
    return result.rows.map((row) => row.achievement_id);
  }

  public async scheduleEvent(guildId: string, startsAt: Date, endsAt: Date, createdBy: string): Promise<LevelEvent> {
    const result = await this.pool.query<LevelEventRow>(
      `INSERT INTO community_level_events (guild_id, starts_at, ends_at, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id) DO UPDATE SET starts_at = $2, ends_at = $3, created_by = $4
       RETURNING guild_id, starts_at, ends_at, created_by`,
      [guildId, startsAt, endsAt, createdBy],
    );
    return mapLevelEvent(result.rows[0]!);
  }

  public async upcomingEvent(guildId: string): Promise<LevelEvent | null> {
    const result = await this.pool.query<LevelEventRow>(
      `SELECT guild_id, starts_at, ends_at, created_by
       FROM community_level_events
       WHERE guild_id = $1 AND ends_at > NOW()
       LIMIT 1`,
      [guildId],
    );
    return result.rows[0] ? mapLevelEvent(result.rows[0]) : null;
  }

  public async stopEvent(guildId: string): Promise<boolean> {
    return (await this.pool.query("DELETE FROM community_level_events WHERE guild_id = $1", [guildId])).rowCount === 1;
  }
}

function mapLevelRow(row: LevelRow, rank: number | null): LevelProfile {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    xp: parseInteger(row.xp, "xp"),
    messageCount: parseInteger(row.message_count, "message_count"),
    voiceMinutes: parseInteger(row.voice_minutes, "voice_minutes"),
    lastAwardedAt: row.last_awarded_at ? new Date(row.last_awarded_at) : null,
    rank,
  };
}

function mapLevelEvent(row: LevelEventRow): LevelEvent {
  return { guildId: row.guild_id, startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at), createdBy: row.created_by };
}

function parseInteger(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by PostgreSQL.`);
  return parsed;
}

export { LevelRepository };
export type { LevelEvent, LevelProfile, LevelStorage };
