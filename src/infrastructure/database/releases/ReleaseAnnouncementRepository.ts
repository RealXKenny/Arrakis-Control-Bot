import type { Pool, PoolClient } from "pg";

interface ReleaseAnnouncementRecord { repository: string; version: string; messageId: string }
interface ReleaseAnnouncementChannel {
  isImported(): Promise<boolean>;
  list(): Promise<ReleaseAnnouncementRecord[]>;
  record(release: ReleaseAnnouncementRecord): Promise<void>;
  markImported(): Promise<void>;
}
interface ReleaseAnnouncementStorage {
  withChannel(channelId: string, task: (channel: ReleaseAnnouncementChannel) => Promise<void>): Promise<void>;
}

class ReleaseAnnouncementRepository implements ReleaseAnnouncementStorage {
  private initialized?: Promise<void>;
  public constructor(private readonly pool: Pool) {}

  private async initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS bot_release_announcement_channels (
      channel_id TEXT PRIMARY KEY,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bot_release_announcements (
      channel_id TEXT NOT NULL,
      repository TEXT NOT NULL,
      version TEXT NOT NULL,
      message_id TEXT NOT NULL,
      announced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, repository, version)
    );`).then(() => undefined).catch((error: unknown) => {
      this.initialized = undefined;
      throw error;
    });
    await this.initialized;
  }

  public async withChannel(channelId: string, task: (channel: ReleaseAnnouncementChannel) => Promise<void>): Promise<void> {
    await this.initialize();
    const connection = await this.pool.connect();
    let locked = false;
    let discard = false;
    const lockKey = `release-announcements:${channelId}`;
    try {
      const result = await connection.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [lockKey]);
      locked = result.rows[0].locked;
      if (locked) await task(new StoredReleaseChannel(connection, channelId));
    } finally {
      try {
        if (locked) await connection.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
      } catch {
        // A session whose lock cannot be released must not return to the pool.
        discard = true;
      }
      connection.release(discard);
    }
  }
}

class StoredReleaseChannel implements ReleaseAnnouncementChannel {
  public constructor(private readonly connection: PoolClient, private readonly channelId: string) {}
  public async isImported(): Promise<boolean> {
    const result = await this.connection.query("SELECT channel_id FROM bot_release_announcement_channels WHERE channel_id=$1", [this.channelId]);
    return result.rows.length > 0;
  }
  public async list(): Promise<ReleaseAnnouncementRecord[]> {
    const result = await this.connection.query<{ repository: string; version: string; message_id: string }>(
      "SELECT repository, version, message_id FROM bot_release_announcements WHERE channel_id=$1", [this.channelId]);
    return result.rows.map((row) => ({ repository: row.repository, version: row.version, messageId: row.message_id }));
  }
  public async record(release: ReleaseAnnouncementRecord): Promise<void> {
    await this.connection.query(`INSERT INTO bot_release_announcements (channel_id, repository, version, message_id)
      VALUES ($1,$2,$3,$4) ON CONFLICT (channel_id, repository, version) DO NOTHING`,
    [this.channelId, release.repository, release.version, release.messageId]);
  }
  public async markImported(): Promise<void> {
    await this.connection.query("INSERT INTO bot_release_announcement_channels (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING", [this.channelId]);
  }
}

export { ReleaseAnnouncementRepository };
export type { ReleaseAnnouncementStorage, ReleaseAnnouncementChannel, ReleaseAnnouncementRecord };
