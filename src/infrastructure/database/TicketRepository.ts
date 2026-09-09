import { Pool, type PoolConfig, type QueryResultRow } from "pg";

type TicketStatus = "provisioning" | "open" | "closed";

interface TicketRecord {
  id: number;
  guildId: string;
  channelId: string | null;
  ticketMessageId: string | null;
  openerId: string;
  subject: string;
  category: string;
  description: string;
  stepsTried: string;
  impact: string;
  duneLookupStatus: TicketDuneLookupStatus;
  duneAccount: TicketDuneAccount | null;
  status: TicketStatus;
  createdAt: Date;
  closedAt: Date | null;
  closedBy: string | null;
  claimedBy: string | null;
  claimedAt: Date | null;
  transcript: string | null;
  transcriptCreatedAt: Date | null;
  transcriptMessageCount: number;
  reviewRating: number | null;
  reviewResolved: boolean | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  archiveChannelId: string | null;
  archiveMessageId: string | null;
}

interface TicketIntake {
  subject: string;
  category: string;
  description: string;
  stepsTried: string;
  impact: string;
}

interface TicketDuneAccount {
  characterName: string | null;
  pawnId: string | null;
  controllerId: string | null;
  onlineStatus: string | null;
}

interface TicketReviewInput {
  rating: number;
  resolved: boolean;
  comment: string;
}

type TicketDuneLookupStatus = "linked" | "unlinked" | "unavailable";

interface TicketRow extends QueryResultRow {
  id: string | number;
  guild_id: string;
  channel_id: string | null;
  ticket_message_id: string | null;
  opener_id: string;
  subject: string;
  category: string;
  description: string;
  steps_tried: string;
  impact: string;
  dune_lookup_status: TicketDuneLookupStatus;
  dune_linked: boolean;
  dune_character_name: string | null;
  dune_pawn_id: string | null;
  dune_controller_id: string | null;
  dune_online_status: string | null;
  status: TicketStatus;
  created_at: Date | string;
  closed_at: Date | string | null;
  closed_by: string | null;
  claimed_by: string | null;
  claimed_at: Date | string | null;
  transcript: string | null;
  transcript_created_at: Date | string | null;
  transcript_message_count: number;
  review_rating: number | null;
  review_resolved: boolean | null;
  review_comment: string | null;
  reviewed_at: Date | string | null;
  archive_channel_id: string | null;
  archive_message_id: string | null;
}

const TICKET_COLUMNS = `
  id,
  guild_id,
  channel_id,
  ticket_message_id,
  opener_id,
  subject,
  category,
  description,
  steps_tried,
  impact,
  dune_lookup_status,
  dune_linked,
  dune_character_name,
  dune_pawn_id,
  dune_controller_id,
  dune_online_status,
  status,
  created_at,
  closed_at,
  closed_by,
  claimed_by,
  claimed_at,
  transcript,
  transcript_created_at,
  transcript_message_count,
  review_rating,
  review_resolved,
  review_comment,
  reviewed_at,
  archive_channel_id,
  archive_message_id
`;

class TicketRepository {
  readonly pool: Pool;

  constructor(connectionString: string, ssl = false) {
    const config: PoolConfig = {
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };

    if (ssl) {
      config.ssl = { rejectUnauthorized: false };
    }

    this.pool = new Pool(config);
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT UNIQUE,
        ticket_message_id TEXT,
        opener_id TEXT NOT NULL,
        subject VARCHAR(100) NOT NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'Other',
        description VARCHAR(1000) NOT NULL,
        steps_tried VARCHAR(1000) NOT NULL DEFAULT '',
        impact VARCHAR(500) NOT NULL DEFAULT '',
        dune_lookup_status VARCHAR(20) NOT NULL DEFAULT 'unavailable',
        dune_linked BOOLEAN NOT NULL DEFAULT FALSE,
        dune_character_name VARCHAR(100),
        dune_pawn_id TEXT,
        dune_controller_id TEXT,
        dune_online_status VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'provisioning'
          CHECK (status IN ('provisioning', 'open', 'closed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        closed_by TEXT,
        claimed_by TEXT,
        claimed_at TIMESTAMPTZ,
        transcript TEXT,
        transcript_created_at TIMESTAMPTZ,
        transcript_message_count INTEGER NOT NULL DEFAULT 0,
        review_rating SMALLINT CHECK (review_rating BETWEEN 1 AND 5),
        review_resolved BOOLEAN,
        review_comment VARCHAR(2000),
        reviewed_at TIMESTAMPTZ,
        archive_channel_id TEXT,
        archive_message_id TEXT
      )
    `);

    await this.pool.query(`
      ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'Other',
        ADD COLUMN IF NOT EXISTS ticket_message_id TEXT,
        ADD COLUMN IF NOT EXISTS steps_tried VARCHAR(1000) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS impact VARCHAR(500) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS dune_lookup_status VARCHAR(20) NOT NULL DEFAULT 'unavailable',
        ADD COLUMN IF NOT EXISTS dune_linked BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS dune_character_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS dune_pawn_id TEXT,
        ADD COLUMN IF NOT EXISTS dune_controller_id TEXT,
        ADD COLUMN IF NOT EXISTS dune_online_status VARCHAR(100),
        ADD COLUMN IF NOT EXISTS transcript TEXT,
        ADD COLUMN IF NOT EXISTS transcript_created_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS transcript_message_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS review_rating SMALLINT,
        ADD COLUMN IF NOT EXISTS review_resolved BOOLEAN,
        ADD COLUMN IF NOT EXISTS review_comment VARCHAR(2000),
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS claimed_by TEXT,
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS archive_channel_id TEXT,
        ADD COLUMN IF NOT EXISTS archive_message_id TEXT
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_active_per_member
      ON tickets (guild_id, opener_id)
      WHERE status IN ('provisioning', 'open')
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS tickets_channel_lookup
      ON tickets (channel_id)
      WHERE channel_id IS NOT NULL
    `);

    await this.pool.query(`
      DELETE FROM tickets
      WHERE status = 'provisioning'
        AND created_at < NOW() - INTERVAL '10 minutes'
    `);
  }

  async reserve(guildId: string, openerId: string, intake: TicketIntake, duneLookupStatus: TicketDuneLookupStatus, duneAccount: TicketDuneAccount | null): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `INSERT INTO tickets (
         guild_id, opener_id, subject, category, description, steps_tried, impact,
         dune_lookup_status, dune_linked, dune_character_name, dune_pawn_id, dune_controller_id, dune_online_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (guild_id, opener_id) WHERE status IN ('provisioning', 'open')
       DO NOTHING
       RETURNING ${TICKET_COLUMNS}`,
      [
        guildId,
        openerId,
        intake.subject,
        intake.category,
        intake.description,
        intake.stepsTried,
        intake.impact,
        duneLookupStatus,
        duneAccount !== null,
        duneAccount?.characterName ?? null,
        duneAccount?.pawnId ?? null,
        duneAccount?.controllerId ?? null,
        duneAccount?.onlineStatus ?? null,
      ],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async activate(id: number, channelId: string, ticketMessageId: string): Promise<TicketRecord> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET channel_id = $2, ticket_message_id = $3, status = 'open'
       WHERE id = $1 AND status = 'provisioning'
       RETURNING ${TICKET_COLUMNS}`,
      [id, channelId, ticketMessageId],
    );

    if (!result.rows[0]) {
      throw new Error(`Ticket ${id} could not be activated.`);
    }

    return mapTicket(result.rows[0]);
  }

  async findActiveForMember(guildId: string, openerId: string): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `SELECT ${TICKET_COLUMNS}
       FROM tickets
       WHERE guild_id = $1 AND opener_id = $2
         AND status IN ('provisioning', 'open')
       ORDER BY id DESC
       LIMIT 1`,
      [guildId, openerId],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async findByChannel(channelId: string): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `SELECT ${TICKET_COLUMNS}
       FROM tickets
       WHERE channel_id = $1
       LIMIT 1`,
      [channelId],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async findById(id: number): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `SELECT ${TICKET_COLUMNS}
       FROM tickets
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async submitReview(id: number, openerId: string, review: TicketReviewInput): Promise<TicketRecord | null> {
    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
      throw new Error("Ticket review ratings must be integers from 1 to 5.");
    }

    if (review.comment.length > 2_000) {
      throw new Error("Ticket review comments must be 2,000 characters or fewer.");
    }

    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET review_rating = $3, review_resolved = $4, review_comment = $5, reviewed_at = NOW()
       WHERE id = $1 AND opener_id = $2 AND status = 'closed' AND reviewed_at IS NULL
       RETURNING ${TICKET_COLUMNS}`,
      [id, openerId, review.rating, review.resolved, review.comment || null],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async claim(id: number, staffId: string): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET claimed_by = $2, claimed_at = COALESCE(claimed_at, NOW())
       WHERE id = $1 AND status = 'open' AND (claimed_by IS NULL OR claimed_by = $2)
       RETURNING ${TICKET_COLUMNS}`,
      [id, staffId],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async unclaim(id: number, staffId: string): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET claimed_by = NULL, claimed_at = NULL
       WHERE id = $1 AND status = 'open' AND claimed_by = $2
       RETURNING ${TICKET_COLUMNS}`,
      [id, staffId],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async setArchiveMessage(id: number, archiveChannelId: string, archiveMessageId: string): Promise<TicketRecord> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET archive_channel_id = $2, archive_message_id = $3
       WHERE id = $1 AND status = 'closed'
       RETURNING ${TICKET_COLUMNS}`,
      [id, archiveChannelId, archiveMessageId],
    );

    if (!result.rows[0]) throw new Error(`Ticket ${id} archive location could not be saved.`);
    return mapTicket(result.rows[0]);
  }

  async closeByChannel(channelId: string, closedBy: string, transcript: string, messageCount: number, handledBy: string | null): Promise<TicketRecord | null> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET status = 'closed', closed_at = NOW(), closed_by = $2,
           transcript = $3, transcript_created_at = NOW(), transcript_message_count = $4,
           claimed_by = COALESCE(claimed_by, $5), claimed_at = CASE WHEN claimed_by IS NULL AND $5 IS NOT NULL THEN NOW() ELSE claimed_at END
       WHERE channel_id = $1 AND status = 'open'
         AND ($5::TEXT IS NULL OR claimed_by IS NULL OR claimed_by = $5)
       RETURNING ${TICKET_COLUMNS}`,
      [channelId, closedBy, transcript, messageCount, handledBy],
    );

    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async updateTranscript(id: number, transcript: string, messageCount: number): Promise<TicketRecord> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET transcript = $2, transcript_created_at = NOW(), transcript_message_count = $3
       WHERE id = $1 AND status = 'closed'
       RETURNING ${TICKET_COLUMNS}`,
      [id, transcript, messageCount],
    );

    if (!result.rows[0]) throw new Error(`Ticket ${id} transcript could not be finalized.`);
    return mapTicket(result.rows[0]);
  }

  async remove(id: number): Promise<void> {
    await this.pool.query("DELETE FROM tickets WHERE id = $1", [id]);
  }

  async reopen(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE tickets
       SET status = 'open', closed_at = NULL, closed_by = NULL,
           transcript = NULL, transcript_created_at = NULL, transcript_message_count = 0
       WHERE id = $1 AND status = 'closed'`,
      [id],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapTicket(row: TicketRow): TicketRecord {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    channelId: row.channel_id,
    ticketMessageId: row.ticket_message_id,
    openerId: row.opener_id,
    subject: row.subject,
    category: row.category,
    description: row.description,
    stepsTried: row.steps_tried,
    impact: row.impact,
    duneLookupStatus: row.dune_lookup_status,
    duneAccount: row.dune_linked
      ? {
          characterName: row.dune_character_name,
          pawnId: row.dune_pawn_id,
          controllerId: row.dune_controller_id,
          onlineStatus: row.dune_online_status,
        }
      : null,
    status: row.status,
    createdAt: new Date(row.created_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    closedBy: row.closed_by,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    transcript: row.transcript,
    transcriptCreatedAt: row.transcript_created_at ? new Date(row.transcript_created_at) : null,
    transcriptMessageCount: row.transcript_message_count,
    reviewRating: row.review_rating,
    reviewResolved: row.review_resolved,
    reviewComment: row.review_comment,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    archiveChannelId: row.archive_channel_id,
    archiveMessageId: row.archive_message_id,
  };
}

export { TicketRepository };

export type { TicketDuneAccount, TicketDuneLookupStatus, TicketIntake, TicketRecord, TicketReviewInput, TicketStatus };
