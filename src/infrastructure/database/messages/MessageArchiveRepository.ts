import type { Pool } from "pg";

interface ArchivedMessageMetadata {
  attachments: Array<{ id: string; name: string | null; url: string; size: number; contentType: string | null }>;
  embeds: unknown[];
  components: unknown[];
  stickers: Array<{ id: string; name: string; format: number }>;
  reference: { messageId: string | null; channelId: string | null; guildId: string | null } | null;
}

interface MessageArchiveInput {
  messageId: string;
  guildId: string;
  channelId: string;
  authorId: string;
  authorTag: string;
  content: string;
  metadata: ArchivedMessageMetadata;
  messageType: number;
  flags: string;
  isBot: boolean;
  webhookId: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

interface ArchivedMessage extends MessageArchiveInput {
  deletedAt: Date | null;
}

interface ArchivedMessageRow {
  message_id: string;
  guild_id: string;
  channel_id: string;
  author_id: string;
  author_tag: string;
  content: string;
  metadata: ArchivedMessageMetadata;
  message_type: number;
  flags: string;
  is_bot: boolean;
  webhook_id: string | null;
  created_at: Date | string;
  edited_at: Date | string | null;
  deleted_at: Date | string | null;
}

interface MessageArchiveBufferOptions {
  /** Rows per multi-row insert. */
  batchSize?: number;
  /** Rows held in memory before new messages are dropped from the archive. */
  maxBuffered?: number;
  flushIntervalMs?: number;
}

const PURGE_BATCH_ROWS = 5_000;
const PURGE_MAX_BATCHES = 40;
const COLUMNS_PER_ROW = 13;

class MessageArchiveRepository {
  private readonly pending = new Map<string, MessageArchiveInput>();
  private flushing: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private droppedCount = 0;
  private readonly batchSize: number;
  private readonly maxBuffered: number;
  private readonly flushIntervalMs: number;

  public constructor(private readonly pool: Pool, options: MessageArchiveBufferOptions = {}) {
    this.batchSize = options.batchSize ?? 200;
    this.maxBuffered = options.maxBuffered ?? 10_000;
    this.flushIntervalMs = options.flushIntervalMs ?? 1_000;
  }

  /** Messages dropped because the buffer was full, since the last call. */
  public takeDroppedCount(): number {
    const dropped = this.droppedCount;
    this.droppedCount = 0;
    return dropped;
  }

  public get bufferedCount(): number {
    return this.pending.size;
  }

  /** Queues a new message for the next batched insert. Returns false when the buffer is full. */
  public enqueue(message: MessageArchiveInput): boolean {
    if (!this.pending.has(message.messageId) && this.pending.size >= this.maxBuffered) {
      this.droppedCount++;
      return false;
    }
    this.pending.set(message.messageId, message);
    if (this.pending.size >= this.batchSize) void this.flush().catch(() => undefined);
    return true;
  }

  public start(onError: (error: unknown) => void): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.flush().catch(onError); }, this.flushIntervalMs);
    this.timer.unref();
  }

  /** Stops the timer and writes everything still buffered. */
  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }

  /** Writes buffered messages in order; concurrent callers share one sequence of writes. */
  public flush(): Promise<void> {
    this.flushing = this.flushing.catch(() => undefined).then(() => this.writePending());
    return this.flushing;
  }

  private async writePending(): Promise<void> {
    while (this.pending.size > 0) {
      const batch = [...this.pending.values()].slice(0, this.batchSize);
      for (const message of batch) this.pending.delete(message.messageId);
      try {
        const params: unknown[] = [];
        const rows = batch.map((message) => {
          const offset = params.length;
          params.push(...values(message));
          return `(${Array.from({ length: COLUMNS_PER_ROW }, (_, index) => `$${offset + index + 1}${index === 6 ? "::jsonb" : ""}`).join(",")})`;
        });
        await this.pool.query(`INSERT INTO bot_discord_messages
          (message_id, guild_id, channel_id, author_id, author_tag, content, metadata, message_type, flags, is_bot, webhook_id, created_at, edited_at)
          VALUES ${rows.join(",")}
          ON CONFLICT (message_id) DO UPDATE SET
            guild_id=EXCLUDED.guild_id, channel_id=EXCLUDED.channel_id, author_id=EXCLUDED.author_id,
            author_tag=EXCLUDED.author_tag, content=EXCLUDED.content, metadata=EXCLUDED.metadata,
            message_type=EXCLUDED.message_type, flags=EXCLUDED.flags, is_bot=EXCLUDED.is_bot,
            webhook_id=EXCLUDED.webhook_id, edited_at=EXCLUDED.edited_at, archived_at=NOW()`, params);
      } catch (error) {
        // Put the batch back unless a newer copy arrived or the buffer is full, then let the caller report it.
        for (const message of batch) {
          if (this.pending.has(message.messageId)) continue;
          if (this.pending.size < this.maxBuffered) this.pending.set(message.messageId, message);
          else this.droppedCount++;
        }
        throw error;
      }
    }
  }

  /** Writes the buffered original before an edit or delete, and never lets a stale buffered copy overwrite it later. */
  private async settle(messageId: string): Promise<void> {
    await this.flush().catch(() => undefined);
    this.pending.delete(messageId);
  }

  /** Removes archived messages and edit history older than the retention period, in bounded batches. Returns rows removed. */
  public async purgeOlderThan(days: number): Promise<number> {
    if (!Number.isInteger(days) || days < 1) throw new Error("Message archive retention must be a positive number of days.");
    let removed = 0;
    for (const statement of [PURGE_MESSAGES_SQL, PURGE_EDITS_SQL]) {
      for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
        const result = await this.pool.query(statement, [days, PURGE_BATCH_ROWS]);
        const count = result.rowCount ?? 0;
        removed += count;
        if (count < PURGE_BATCH_ROWS) break;
      }
    }
    return removed;
  }

  public async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS bot_discord_messages (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_tag TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      message_type INTEGER NOT NULL DEFAULT 0,
      flags TEXT NOT NULL DEFAULT '0',
      is_bot BOOLEAN NOT NULL DEFAULT FALSE,
      webhook_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      edited_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS bot_discord_messages_channel_time ON bot_discord_messages (guild_id, channel_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS bot_discord_messages_author_time ON bot_discord_messages (guild_id, author_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS bot_discord_messages_deleted ON bot_discord_messages (guild_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
    CREATE TABLE IF NOT EXISTS bot_discord_message_edits (
      id BIGSERIAL PRIMARY KEY,
      message_id TEXT NOT NULL,
      before_content TEXT NOT NULL,
      after_content TEXT NOT NULL,
      before_metadata JSONB NOT NULL,
      after_metadata JSONB NOT NULL,
      edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS bot_discord_message_edits_history ON bot_discord_message_edits (message_id, edited_at DESC);`);
    // Built concurrently, one statement per call, so an existing large archive stays writable during startup.
    await this.pool.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS bot_discord_messages_created ON bot_discord_messages (created_at)");
    await this.pool.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS bot_discord_message_edits_time ON bot_discord_message_edits (edited_at)");
  }

  public async save(message: MessageArchiveInput): Promise<void> {
    await this.pool.query(`INSERT INTO bot_discord_messages
      (message_id, guild_id, channel_id, author_id, author_tag, content, metadata, message_type, flags, is_bot, webhook_id, created_at, edited_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (message_id) DO UPDATE SET
        guild_id=EXCLUDED.guild_id, channel_id=EXCLUDED.channel_id, author_id=EXCLUDED.author_id,
        author_tag=EXCLUDED.author_tag, content=EXCLUDED.content, metadata=EXCLUDED.metadata,
        message_type=EXCLUDED.message_type, flags=EXCLUDED.flags, is_bot=EXCLUDED.is_bot,
        webhook_id=EXCLUDED.webhook_id, edited_at=EXCLUDED.edited_at, deleted_at=NULL, archived_at=NOW()`, values(message));
  }

  public async recordEdit(before: MessageArchiveInput, after: MessageArchiveInput): Promise<ArchivedMessage | null> {
    await this.settle(after.messageId);
    const result = await this.pool.query<ArchivedMessageRow>(`WITH previous AS (
      SELECT * FROM bot_discord_messages WHERE message_id=$1
      UNION ALL SELECT $1,$2,$3,$4,$5,$14,$15::jsonb,$8,$9,$10,$11,$12,$13,NULL,NOW()
      WHERE NOT EXISTS (SELECT 1 FROM bot_discord_messages WHERE message_id=$1) LIMIT 1
    ), updated AS (
      INSERT INTO bot_discord_messages
        (message_id,guild_id,channel_id,author_id,author_tag,content,metadata,message_type,flags,is_bot,webhook_id,created_at,edited_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (message_id) DO UPDATE SET content=EXCLUDED.content, metadata=EXCLUDED.metadata,
        author_tag=EXCLUDED.author_tag, edited_at=EXCLUDED.edited_at, flags=EXCLUDED.flags, archived_at=NOW()
      RETURNING *
    ), revision AS (
      INSERT INTO bot_discord_message_edits (message_id,before_content,after_content,before_metadata,after_metadata,edited_at)
      SELECT $1, previous.content, $6, previous.metadata, $7::jsonb, COALESCE($13,NOW()) FROM previous
      WHERE previous.content IS DISTINCT FROM $6 OR previous.metadata->'attachments' IS DISTINCT FROM ($7::jsonb)->'attachments'
      RETURNING id
    )
    SELECT previous.* FROM previous WHERE EXISTS (SELECT 1 FROM revision)`, [...values(after), before.content, JSON.stringify(before.metadata)]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  public async markDeleted(fallback: MessageArchiveInput): Promise<ArchivedMessage> {
    await this.settle(fallback.messageId);
    // Dev note: Deleted from Discord is not deleted from history; the archivist has trust issues.
    const result = await this.pool.query<ArchivedMessageRow>(`INSERT INTO bot_discord_messages
      (message_id,guild_id,channel_id,author_id,author_tag,content,metadata,message_type,flags,is_bot,webhook_id,created_at,edited_at,deleted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,NOW())
      ON CONFLICT (message_id) DO UPDATE SET deleted_at=COALESCE(bot_discord_messages.deleted_at,NOW()), archived_at=NOW()
      RETURNING *`, values(fallback));
    return mapRow(result.rows[0]);
  }
}

const PURGE_MESSAGES_SQL = `DELETE FROM bot_discord_messages WHERE message_id IN (
  SELECT message_id FROM bot_discord_messages WHERE created_at < NOW() - $1 * INTERVAL '1 day' LIMIT $2)`;
const PURGE_EDITS_SQL = `DELETE FROM bot_discord_message_edits WHERE id IN (
  SELECT id FROM bot_discord_message_edits WHERE edited_at < NOW() - $1 * INTERVAL '1 day' LIMIT $2)`;

function values(message: MessageArchiveInput): unknown[] {
  return [message.messageId, message.guildId, message.channelId, message.authorId, message.authorTag, message.content, JSON.stringify(message.metadata), message.messageType, message.flags, message.isBot, message.webhookId, message.createdAt, message.editedAt];
}

function mapRow(row: ArchivedMessageRow): ArchivedMessage {
  return {
    messageId: row.message_id, guildId: row.guild_id, channelId: row.channel_id, authorId: row.author_id,
    authorTag: row.author_tag, content: row.content, metadata: row.metadata, messageType: row.message_type,
    flags: row.flags, isBot: row.is_bot, webhookId: row.webhook_id, createdAt: new Date(row.created_at),
    editedAt: row.edited_at ? new Date(row.edited_at) : null, deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export { MessageArchiveRepository };
export type { ArchivedMessage, ArchivedMessageMetadata, MessageArchiveInput };
