import type { Pool } from "pg";

interface StoredPanel { messageId: string | null; renderKey: string | null }
interface PanelSession {
  get(): Promise<StoredPanel | null>;
  save(messageId: string | null, renderKey?: string | null): Promise<void>;
}
interface PanelStorage {
  withPanel(channelId: string, panelKey: string, task: (session: PanelSession) => Promise<void>): Promise<void>;
}

class PanelRepository implements PanelStorage {
  private initialized?: Promise<void>;
  public constructor(private readonly pool: Pool) {}

  private async initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS bot_persistent_panels (
      channel_id TEXT NOT NULL,
      panel_key TEXT NOT NULL,
      message_id TEXT,
      render_key TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, panel_key)
    )`).then(() => undefined).catch((error: unknown) => {
      this.initialized = undefined;
      throw error;
    });
    await this.initialized;
  }

  public async withPanel(channelId: string, panelKey: string, task: (session: PanelSession) => Promise<void>): Promise<void> {
    await this.initialize();
    const connection = await this.pool.connect();
    const lockKey = `persistent-panel:${channelId}:${panelKey}`;
    let locked = false;
    let discard = false;
    try {
      try {
        const result = await connection.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [lockKey]);
        locked = result.rows[0].locked;
      } catch (error) {
        discard = true;
        throw error;
      }
      if (!locked) return;
      await task({
        get: async () => {
          const result = await connection.query<{ message_id: string | null; render_key: string | null }>(
            "SELECT message_id, render_key FROM bot_persistent_panels WHERE channel_id=$1 AND panel_key=$2", [channelId, panelKey]);
          const row = result.rows[0];
          return row ? { messageId: row.message_id, renderKey: row.render_key } : null;
        },
        save: async (messageId, renderKey = null) => {
          await connection.query(`INSERT INTO bot_persistent_panels (channel_id, panel_key, message_id, render_key)
            VALUES ($1,$2,$3,$4) ON CONFLICT (channel_id, panel_key) DO UPDATE SET
            message_id=EXCLUDED.message_id, render_key=EXCLUDED.render_key, updated_at=NOW()`, [channelId, panelKey, messageId, renderKey]);
        },
      });
    } finally {
      try {
        if (locked) await connection.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
      } catch { discard = true; }
      connection.release(discard);
    }
  }
}

export { PanelRepository };
export type { PanelStorage, PanelSession, StoredPanel };
