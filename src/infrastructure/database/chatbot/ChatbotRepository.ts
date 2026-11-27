import type { Pool, QueryResultRow } from "pg";

/** An answer staff taught the chatbot. */
interface TaughtAnswer {
  /** BIGSERIAL kept as a decimal string. */
  id: string;
  guildId: string;
  question: string;
  answer: string;
  createdBy: string;
  createdAt: Date;
  uses: number;
}

/** A question a member asked in chat and the answer another member gave. */
interface LearnedAnswer {
  id: string;
  guildId: string;
  channelId: string;
  question: string;
  answer: string;
  askerId: string;
  answererId: string;
  questionMessageId: string;
  answerMessageId: string;
  /** The answer came from staff, so it is trusted a little more. */
  fromStaff: boolean;
  createdAt: Date;
  uses: number;
}

type NewLearnedAnswer = Omit<LearnedAnswer, "id" | "createdAt" | "uses">;

interface ChatbotStorage {
  initialize(): Promise<void>;
  list(guildId: string): Promise<TaughtAnswer[]>;
  count(guildId: string): Promise<number>;
  add(guildId: string, question: string, answer: string, createdBy: string): Promise<TaughtAnswer>;
  remove(guildId: string, id: string): Promise<TaughtAnswer | null>;
  recordUse(id: string): Promise<void>;
  listLearned(guildId: string): Promise<LearnedAnswer[]>;
  /** Saves a learned answer (one per answer message) and trims the oldest unused ones past `limit`. */
  learn(answer: NewLearnedAnswer, limit: number): Promise<LearnedAnswer | null>;
  /** Removes learned answers whose question or answer message is one of `messageIds`. */
  forgetMessages(guildId: string, messageIds: readonly string[]): Promise<string[]>;
  forgetLearned(guildId: string, id: string): Promise<LearnedAnswer | null>;
  /** Removes everything learned from one member, as asker or answerer. */
  forgetMember(guildId: string, userId: string): Promise<number>;
  purgeLearned(guildId: string): Promise<number>;
  recordLearnedUse(id: string): Promise<void>;
  optedOut(guildId: string): Promise<string[]>;
  setOptOut(guildId: string, userId: string, optedOut: boolean): Promise<void>;
  /** The bot's saved mood in a server, so its feelings survive a restart. */
  mood(guildId: string): Promise<{ score: number; updatedAt: Date } | null>;
  saveMood(guildId: string, score: number, updatedAt: Date): Promise<void>;
  rapport(guildId: string, userId: string): Promise<number>;
  saveRapport(guildId: string, userId: string, score: number): Promise<void>;
}

interface TaughtRow extends QueryResultRow {
  id: string;
  guild_id: string;
  question: string;
  answer: string;
  created_by: string;
  created_at: Date;
  uses: number;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS chatbot_answers (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uses INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS chatbot_answers_guild_idx ON chatbot_answers (guild_id, id);
`;

interface LearnedRow extends QueryResultRow {
  id: string;
  guild_id: string;
  channel_id: string;
  question: string;
  answer: string;
  asker_id: string;
  answerer_id: string;
  question_message_id: string;
  answer_message_id: string;
  from_staff: boolean;
  created_at: Date;
  uses: number;
}

const CREATE_LEARNED = `
  CREATE TABLE IF NOT EXISTS chatbot_learned (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    asker_id TEXT NOT NULL,
    answerer_id TEXT NOT NULL,
    question_message_id TEXT NOT NULL,
    answer_message_id TEXT NOT NULL UNIQUE,
    from_staff BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uses INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS chatbot_learned_guild_idx ON chatbot_learned (guild_id, id);
  CREATE INDEX IF NOT EXISTS chatbot_learned_question_idx ON chatbot_learned (question_message_id);
  CREATE TABLE IF NOT EXISTS chatbot_mood (
    guild_id TEXT PRIMARY KEY,
    score DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chatbot_rapport (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    score DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS chatbot_optouts (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
  );
`;

const LEARNED_COLUMNS = "id::text AS id, guild_id, channel_id, question, answer, asker_id, answerer_id, question_message_id, answer_message_id, from_staff, created_at, uses";

const COLUMNS = "id::text AS id, guild_id, question, answer, created_by, created_at, uses";

class ChatbotRepository implements ChatbotStorage {
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    await this.pool.query(CREATE_TABLE);
    await this.pool.query(CREATE_LEARNED);
  }

  public async list(guildId: string): Promise<TaughtAnswer[]> {
    const result = await this.pool.query<TaughtRow>(`SELECT ${COLUMNS} FROM chatbot_answers WHERE guild_id = $1 ORDER BY id`, [guildId]);
    return result.rows.map(toAnswer);
  }

  public async count(guildId: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM chatbot_answers WHERE guild_id = $1", [guildId]);
    return Number(result.rows[0]?.total ?? 0);
  }

  public async add(guildId: string, question: string, answer: string, createdBy: string): Promise<TaughtAnswer> {
    const result = await this.pool.query<TaughtRow>(
      `INSERT INTO chatbot_answers (guild_id, question, answer, created_by) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [guildId, question, answer, createdBy],
    );
    return toAnswer(result.rows[0]!);
  }

  public async remove(guildId: string, id: string): Promise<TaughtAnswer | null> {
    const result = await this.pool.query<TaughtRow>(`DELETE FROM chatbot_answers WHERE guild_id = $1 AND id = $2::bigint RETURNING ${COLUMNS}`, [guildId, id]);
    return result.rows[0] ? toAnswer(result.rows[0]) : null;
  }

  public async recordUse(id: string): Promise<void> {
    await this.pool.query("UPDATE chatbot_answers SET uses = LEAST(uses + 1, 2000000000) WHERE id = $1::bigint", [id]);
  }

  public async listLearned(guildId: string): Promise<LearnedAnswer[]> {
    const result = await this.pool.query<LearnedRow>(`SELECT ${LEARNED_COLUMNS} FROM chatbot_learned WHERE guild_id = $1 ORDER BY id`, [guildId]);
    return result.rows.map(toLearned);
  }

  public async learn(answer: NewLearnedAnswer, limit: number): Promise<LearnedAnswer | null> {
    const result = await this.pool.query<LearnedRow>(
      `INSERT INTO chatbot_learned (guild_id, channel_id, question, answer, asker_id, answerer_id, question_message_id, answer_message_id, from_staff)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       WHERE NOT EXISTS (SELECT 1 FROM chatbot_optouts WHERE guild_id = $1 AND user_id IN ($5, $6))
       ON CONFLICT (answer_message_id) DO NOTHING
       RETURNING ${LEARNED_COLUMNS}`,
      [answer.guildId, answer.channelId, answer.question, answer.answer, answer.askerId, answer.answererId, answer.questionMessageId, answer.answerMessageId, answer.fromStaff],
    );
    if (!result.rows[0]) return null;
    // Past the limit, the least used and then oldest answers make room.
    await this.pool.query(
      `DELETE FROM chatbot_learned WHERE id IN (
         SELECT id FROM chatbot_learned WHERE guild_id = $1 ORDER BY uses DESC, id DESC OFFSET $2
       )`,
      [answer.guildId, limit],
    );
    return toLearned(result.rows[0]);
  }

  public async forgetMessages(guildId: string, messageIds: readonly string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const result = await this.pool.query<{ id: string }>(
      "DELETE FROM chatbot_learned WHERE guild_id = $1 AND (question_message_id = ANY($2::text[]) OR answer_message_id = ANY($2::text[])) RETURNING id::text AS id",
      [guildId, [...messageIds]],
    );
    return result.rows.map((row) => row.id);
  }

  public async forgetLearned(guildId: string, id: string): Promise<LearnedAnswer | null> {
    const result = await this.pool.query<LearnedRow>(`DELETE FROM chatbot_learned WHERE guild_id = $1 AND id = $2::bigint RETURNING ${LEARNED_COLUMNS}`, [guildId, id]);
    return result.rows[0] ? toLearned(result.rows[0]) : null;
  }

  public async forgetMember(guildId: string, userId: string): Promise<number> {
    const result = await this.pool.query("DELETE FROM chatbot_learned WHERE guild_id = $1 AND (asker_id = $2 OR answerer_id = $2)", [guildId, userId]);
    await this.pool.query("DELETE FROM chatbot_rapport WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return result.rowCount ?? 0;
  }

  public async purgeLearned(guildId: string): Promise<number> {
    const result = await this.pool.query("DELETE FROM chatbot_learned WHERE guild_id = $1", [guildId]);
    return result.rowCount ?? 0;
  }

  public async recordLearnedUse(id: string): Promise<void> {
    await this.pool.query("UPDATE chatbot_learned SET uses = LEAST(uses + 1, 2000000000) WHERE id = $1::bigint", [id]);
  }

  public async mood(guildId: string): Promise<{ score: number; updatedAt: Date } | null> {
    const result = await this.pool.query<{ score: number; updated_at: Date }>("SELECT score, updated_at FROM chatbot_mood WHERE guild_id = $1", [guildId]);
    const row = result.rows[0];
    return row ? { score: Number(row.score), updatedAt: row.updated_at } : null;
  }

  public async saveMood(guildId: string, score: number, updatedAt: Date): Promise<void> {
    await this.pool.query(
      "INSERT INTO chatbot_mood (guild_id, score, updated_at) VALUES ($1, $2, $3) ON CONFLICT (guild_id) DO UPDATE SET score = EXCLUDED.score, updated_at = EXCLUDED.updated_at",
      [guildId, score, updatedAt],
    );
  }

  public async rapport(guildId: string, userId: string): Promise<number> {
    const result = await this.pool.query<{ score: number }>("SELECT score FROM chatbot_rapport WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return Number(result.rows[0]?.score ?? 0);
  }

  public async saveRapport(guildId: string, userId: string, score: number): Promise<void> {
    await this.pool.query(
      "INSERT INTO chatbot_rapport (guild_id, user_id, score) VALUES ($1, $2, $3) ON CONFLICT (guild_id, user_id) DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()",
      [guildId, userId, score],
    );
  }

  public async optedOut(guildId: string): Promise<string[]> {
    const result = await this.pool.query<{ user_id: string }>("SELECT user_id FROM chatbot_optouts WHERE guild_id = $1", [guildId]);
    return result.rows.map((row) => row.user_id);
  }

  public async setOptOut(guildId: string, userId: string, optedOut: boolean): Promise<void> {
    if (optedOut) await this.pool.query("INSERT INTO chatbot_optouts (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [guildId, userId]);
    else await this.pool.query("DELETE FROM chatbot_optouts WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
  }
}

function toLearned(row: LearnedRow): LearnedAnswer {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    question: row.question,
    answer: row.answer,
    askerId: row.asker_id,
    answererId: row.answerer_id,
    questionMessageId: row.question_message_id,
    answerMessageId: row.answer_message_id,
    fromStaff: row.from_staff,
    createdAt: row.created_at,
    uses: Number(row.uses),
  };
}

function toAnswer(row: TaughtRow): TaughtAnswer {
  return {
    id: row.id,
    guildId: row.guild_id,
    question: row.question,
    answer: row.answer,
    createdBy: row.created_by,
    createdAt: row.created_at,
    uses: Number(row.uses),
  };
}

export { ChatbotRepository };
export type { ChatbotStorage, LearnedAnswer, NewLearnedAnswer, TaughtAnswer };
