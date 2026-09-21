import type { Pool } from "pg";

type StaffApplicationStatus = "pending" | "accepted" | "denied";

interface StaffApplicationAnswers {
  identity: string;
  experience: string;
  motivation: string;
  scenario: string;
  availability: string;
}

interface StaffApplicationRecord {
  id: string;
  guildId: string;
  userId: string;
  answers: StaffApplicationAnswers;
  status: StaffApplicationStatus;
  reviewChannelId: string | null;
  reviewMessageId: string | null;
  reviewerId: string | null;
  reviewReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

interface StaffApplicationRow {
  id: string;
  guild_id: string;
  user_id: string;
  answers: StaffApplicationAnswers;
  status: StaffApplicationStatus;
  review_channel_id: string | null;
  review_message_id: string | null;
  reviewer_id: string | null;
  review_reason: string | null;
  created_at: Date | string;
  decided_at: Date | string | null;
}

class StaffApplicationRepository {
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS bot_staff_applications (
      id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      answers JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
      review_channel_id TEXT,
      review_message_id TEXT,
      reviewer_id TEXT,
      review_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    )`);
    await this.pool.query("CREATE UNIQUE INDEX IF NOT EXISTS bot_staff_applications_one_pending ON bot_staff_applications (guild_id, user_id) WHERE status = 'pending'");
    await this.pool.query("CREATE INDEX IF NOT EXISTS bot_staff_applications_user_history ON bot_staff_applications (guild_id, user_id, created_at DESC)");
  }

  public async latest(guildId: string, userId: string): Promise<StaffApplicationRecord | null> {
    const result = await this.pool.query<StaffApplicationRow>("SELECT * FROM bot_staff_applications WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1", [guildId, userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  public async create(id: string, guildId: string, userId: string, answers: StaffApplicationAnswers): Promise<StaffApplicationRecord | null> {
    const result = await this.pool.query<StaffApplicationRow>(`INSERT INTO bot_staff_applications (id, guild_id, user_id, answers)
      VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING RETURNING *`, [id, guildId, userId, JSON.stringify(answers)]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  public async attachReview(id: string, channelId: string, messageId: string): Promise<void> {
    await this.pool.query("UPDATE bot_staff_applications SET review_channel_id = $2, review_message_id = $3 WHERE id = $1 AND status = 'pending'", [id, channelId, messageId]);
  }

  public async removePending(id: string): Promise<void> {
    await this.pool.query("DELETE FROM bot_staff_applications WHERE id = $1 AND status = 'pending'", [id]);
  }

  public async decide(id: string, status: Exclude<StaffApplicationStatus, "pending">, reviewerId: string, reason: string): Promise<StaffApplicationRecord | null> {
    const result = await this.pool.query<StaffApplicationRow>(`UPDATE bot_staff_applications SET status = $2, reviewer_id = $3, review_reason = $4, decided_at = NOW()
      WHERE id = $1 AND status = 'pending' RETURNING *`, [id, status, reviewerId, reason]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

function mapRow(row: StaffApplicationRow): StaffApplicationRecord {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    answers: row.answers,
    status: row.status,
    reviewChannelId: row.review_channel_id,
    reviewMessageId: row.review_message_id,
    reviewerId: row.reviewer_id,
    reviewReason: row.review_reason,
    createdAt: new Date(row.created_at),
    decidedAt: row.decided_at ? new Date(row.decided_at) : null,
  };
}

export { StaffApplicationRepository };
export type { StaffApplicationAnswers, StaffApplicationRecord, StaffApplicationStatus };
