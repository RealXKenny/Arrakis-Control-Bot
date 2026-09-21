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

class MessageArchiveRepository {
  public constructor(private readonly pool: Pool) {}

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
    // Dev note: Deleted from Discord is not deleted from history; the archivist has trust issues.
    const result = await this.pool.query<ArchivedMessageRow>(`INSERT INTO bot_discord_messages
      (message_id,guild_id,channel_id,author_id,author_tag,content,metadata,message_type,flags,is_bot,webhook_id,created_at,edited_at,deleted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,NOW())
      ON CONFLICT (message_id) DO UPDATE SET deleted_at=COALESCE(bot_discord_messages.deleted_at,NOW()), archived_at=NOW()
      RETURNING *`, values(fallback));
    return mapRow(result.rows[0]!);
  }
}

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
