import type { Pool } from "pg";

const KEY = /^([1-9]\d{16,19}):([A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{1,64})$/;
const SNOWFLAKE = /^[1-9]\d{16,19}$/;
const MAX_VALUE_BYTES = 16_384;
const MAX_AUDIT_ENTRIES = 100;
const AUDIT_RETENTION_DAYS = 365;

export interface DashboardAuditEntry { spaceId: string; userId: string; key: string; value: unknown; at: number }

/** Durable framework settings and change history. Values are JSON and size-bounded. */
export class DashboardSettingsRepository {
  private initialized?: Promise<void>;
  public constructor(private readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS bot_dashboard_settings (
      guild_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, setting_key)
    );
    CREATE TABLE IF NOT EXISTS bot_dashboard_audit (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      value JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS bot_dashboard_audit_guild_idx ON bot_dashboard_audit (guild_id, created_at DESC);`)
      .then(() => undefined).catch((error: unknown) => { this.initialized = undefined; throw error; });
    await this.initialized;
  }

  /** Framework key-value contract: `<guildId>:<category>.<option>`; missing values are null. */
  public async get(key: string): Promise<unknown> {
    const [, guildId, settingKey] = parseKey(key);
    await this.initialize();
    const result = await this.pool.query<{ value: unknown }>(
      "SELECT value FROM bot_dashboard_settings WHERE guild_id = $1 AND setting_key = $2", [guildId, settingKey]);
    return result.rows[0] ? result.rows[0].value : null;
  }

  public async set(key: string, value: unknown): Promise<void> {
    const [, guildId, settingKey] = parseKey(key);
    const json = serialize(value);
    await this.initialize();
    await this.pool.query(`INSERT INTO bot_dashboard_settings (guild_id, setting_key, value) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (guild_id, setting_key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [guildId, settingKey, json]);
  }

  public async record(entry: Omit<DashboardAuditEntry, "at">): Promise<void> {
    parseKey(`${entry.spaceId}:${entry.key}`);
    if (!SNOWFLAKE.test(entry.userId)) throw new Error("Invalid dashboard audit user");
    const json = serialize(entry.value);
    await this.initialize();
    await this.pool.query("INSERT INTO bot_dashboard_audit (guild_id, user_id, setting_key, value) VALUES ($1, $2, $3, $4::jsonb)",
      [entry.spaceId, entry.userId, entry.key, json]);
  }

  public async list(guildId: string, max = 50): Promise<DashboardAuditEntry[]> {
    if (!SNOWFLAKE.test(guildId) || !Number.isInteger(max) || max < 1 || max > MAX_AUDIT_ENTRIES) throw new Error("Invalid dashboard audit query");
    await this.initialize();
    const result = await this.pool.query<{ user_id: unknown; setting_key: unknown; value: unknown; created_at: unknown }>(
      "SELECT user_id, setting_key, value, created_at FROM bot_dashboard_audit WHERE guild_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
      [guildId, max]);
    return result.rows.map((row) => {
      if (typeof row.user_id !== "string" || typeof row.setting_key !== "string" || !(row.created_at instanceof Date)) {
        throw new Error("Invalid stored dashboard audit entry");
      }
      return { spaceId: guildId, userId: row.user_id, key: row.setting_key, value: row.value, at: row.created_at.getTime() };
    });
  }

  /** Change history older than the retention window is removed by the shared expiry cleanup. */
  public async purgeExpired(): Promise<void> {
    await this.initialize();
    await this.pool.query(`DELETE FROM bot_dashboard_audit WHERE created_at <= NOW() - INTERVAL '${AUDIT_RETENTION_DAYS} days'`);
  }
}

function parseKey(key: string): RegExpExecArray {
  const match = KEY.exec(key);
  if (!match) throw new Error("Invalid dashboard setting key");
  return match;
}

function serialize(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  if (Buffer.byteLength(json, "utf8") > MAX_VALUE_BYTES) throw new Error("Dashboard setting value is too large");
  return json;
}
