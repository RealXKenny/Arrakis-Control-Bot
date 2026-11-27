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

interface ChatbotStorage {
  initialize(): Promise<void>;
  list(guildId: string): Promise<TaughtAnswer[]>;
  count(guildId: string): Promise<number>;
  add(guildId: string, question: string, answer: string, createdBy: string): Promise<TaughtAnswer>;
  remove(guildId: string, id: string): Promise<TaughtAnswer | null>;
  recordUse(id: string): Promise<void>;
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

const COLUMNS = "id::text AS id, guild_id, question, answer, created_by, created_at, uses";

class ChatbotRepository implements ChatbotStorage {
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    await this.pool.query(CREATE_TABLE);
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
export type { ChatbotStorage, TaughtAnswer };
