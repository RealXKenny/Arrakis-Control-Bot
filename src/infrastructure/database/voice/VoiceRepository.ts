import type { Pool } from "pg";

export interface VoiceSettings {
  guild_id: string;
  join_channel_id: string;
  category_id: string;
  panel_channel_id: string;
  panel_message_id: string | null;
  enabled: boolean;
}

export interface VoiceRolePermission {
  id: string;
  allow: string;
  deny: string;
  type: 0;
}

export interface VoiceRoom {
  guild_id: string;
  owner_id: string;
  channel_id: string | null;
  category_id: string;
  creation_key: string;
  role_permissions: VoiceRolePermission[];
}

export class VoiceRepository {
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    // Dev note: One shared pool keeps the database from becoming a swimming complex.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bot_voice_settings (
        guild_id TEXT PRIMARY KEY,
        join_channel_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        panel_channel_id TEXT NOT NULL,
        panel_message_id TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS bot_voice_rooms (
        guild_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        channel_id TEXT UNIQUE,
        category_id TEXT NOT NULL,
        creation_key TEXT NOT NULL UNIQUE,
        role_permissions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, owner_id)
      );
    `);
  }

  public async settings(guildId: string): Promise<VoiceSettings | null> {
    return (await this.pool.query<VoiceSettings>("SELECT * FROM bot_voice_settings WHERE guild_id = $1", [guildId])).rows[0] ?? null;
  }

  public async configure(guildId: string, joinId: string, categoryId: string, panelId: string): Promise<void> {
    await this.pool.query(`INSERT INTO bot_voice_settings (guild_id, join_channel_id, category_id, panel_channel_id)
      VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id) DO UPDATE SET
      join_channel_id = $2, category_id = $3,
      panel_message_id = CASE WHEN bot_voice_settings.panel_channel_id = $4 THEN bot_voice_settings.panel_message_id ELSE NULL END,
      panel_channel_id = $4, enabled = TRUE`,
    [guildId, joinId, categoryId, panelId]);
  }

  public async setPanel(guildId: string, messageId: string): Promise<void> {
    await this.pool.query("UPDATE bot_voice_settings SET panel_message_id = $2 WHERE guild_id = $1", [guildId, messageId]);
  }

  public async disable(guildId: string): Promise<void> {
    await this.pool.query("UPDATE bot_voice_settings SET enabled = FALSE WHERE guild_id = $1", [guildId]);
  }

  public async rooms(guildId: string): Promise<VoiceRoom[]> {
    return (await this.pool.query<VoiceRoom>("SELECT * FROM bot_voice_rooms WHERE guild_id = $1", [guildId])).rows;
  }

  public async owned(guildId: string, ownerId: string): Promise<VoiceRoom | null> {
    return (await this.pool.query<VoiceRoom>("SELECT * FROM bot_voice_rooms WHERE guild_id = $1 AND owner_id = $2", [guildId, ownerId])).rows[0] ?? null;
  }

  public async reserve(room: VoiceRoom): Promise<boolean> {
    const result = await this.pool.query(`INSERT INTO bot_voice_rooms
      (guild_id, owner_id, category_id, creation_key, role_permissions) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (guild_id, owner_id) DO NOTHING RETURNING owner_id`,
    [room.guild_id, room.owner_id, room.category_id, room.creation_key, JSON.stringify(room.role_permissions)]);
    return result.rows.length > 0;
  }

  public async attach(room: VoiceRoom, channelId: string): Promise<void> {
    await this.pool.query("UPDATE bot_voice_rooms SET channel_id = $2 WHERE creation_key = $1", [room.creation_key, channelId]);
  }

  public async remove(room: VoiceRoom): Promise<void> {
    await this.pool.query("DELETE FROM bot_voice_rooms WHERE creation_key = $1", [room.creation_key]);
  }
}
