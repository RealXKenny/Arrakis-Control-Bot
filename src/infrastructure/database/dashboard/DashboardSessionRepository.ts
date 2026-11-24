import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SNOWFLAKE = /^[1-9]\d{16,19}$/;
const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60;

/** Stores only a hash of the bearer token and a Discord user ID, never OAuth tokens. */
export class DashboardSessionRepository {
  private initialized?: Promise<void>;
  public constructor(private readonly pool: Pool) {}

  private async initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS bot_dashboard_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_dashboard_sessions_expiry_idx ON bot_dashboard_sessions (expires_at);`)
      .then(() => undefined).catch((error: unknown) => { this.initialized = undefined; throw error; });
    await this.initialized;
  }

  public async create(userId: string, lifetimeSeconds: number): Promise<string> {
    if (!SNOWFLAKE.test(userId) || !Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > MAX_SESSION_SECONDS) {
      throw new Error("Invalid dashboard session");
    }
    await this.initialize();
    const token = randomBytes(32).toString("base64url");
    await this.pool.query(
      "INSERT INTO bot_dashboard_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + $3 * INTERVAL '1 second')",
      [hashToken(token), userId, lifetimeSeconds],
    );
    return token;
  }

  public async getUserId(token: string): Promise<string | null> {
    if (!TOKEN.test(token)) return null;
    await this.initialize();
    const result = await this.pool.query<{ user_id: unknown }>(
      "SELECT user_id FROM bot_dashboard_sessions WHERE token_hash = $1 AND expires_at > NOW()", [hashToken(token)],
    );
    const userId = result.rows[0]?.user_id;
    if (userId === undefined) return null;
    if (typeof userId !== "string" || !SNOWFLAKE.test(userId)) throw new Error("Invalid stored dashboard session");
    return userId;
  }

  public async revoke(token: string): Promise<void> {
    if (!TOKEN.test(token)) return;
    await this.initialize();
    await this.pool.query("DELETE FROM bot_dashboard_sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  public async purgeExpired(): Promise<void> {
    await this.initialize();
    await this.pool.query("DELETE FROM bot_dashboard_sessions WHERE expires_at <= NOW()");
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
