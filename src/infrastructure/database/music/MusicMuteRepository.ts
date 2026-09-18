import type { Pool } from "pg";

export interface MusicMuteStorage {
  initialize(): Promise<void>;
  list(guildId: string): Promise<string[]>;
  add(guildId: string, userId: string): Promise<void>;
  remove(guildId: string, userId: string): Promise<void>;
}

export class MusicMuteRepository implements MusicMuteStorage {
  public constructor(private readonly pool: Pool) {}
  public async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS bot_music_mutes (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (guild_id, user_id)
    )`);
  }
  public async list(guildId: string): Promise<string[]> {
    const result = await this.pool.query<{ user_id: string }>("SELECT user_id FROM bot_music_mutes WHERE guild_id = $1", [guildId]);
    return result.rows.map((row) => row.user_id);
  }
  public async add(guildId: string, userId: string): Promise<void> {
    await this.pool.query("INSERT INTO bot_music_mutes (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [guildId, userId]);
  }
  public async remove(guildId: string, userId: string): Promise<void> {
    await this.pool.query("DELETE FROM bot_music_mutes WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
  }
}
