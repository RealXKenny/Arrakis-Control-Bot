import { createHmac } from "node:crypto";
import type { Pool } from "pg";

export type DashboardRateScope = "global" | "oauth" | "access" | "logout" | "write";

/** Atomic, shared fixed-window limits. The database never stores raw client addresses. */
export class DashboardRateLimitRepository {
  private initialized?: Promise<void>;
  public constructor(private readonly pool: Pool, private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Dashboard rate-limit secret must be at least 32 bytes");
  }

  private async initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS bot_dashboard_rate_limits (
      scope TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      hits INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (scope, subject_hash)
    );
    CREATE INDEX IF NOT EXISTS bot_dashboard_rate_limits_expiry_idx ON bot_dashboard_rate_limits (expires_at);`)
      .then(() => undefined).catch((error: unknown) => { this.initialized = undefined; throw error; });
    await this.initialized;
  }

  public async consume(scope: DashboardRateScope, subject: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!["global", "oauth", "access", "logout", "write"].includes(scope) || !subject || subject.length > 256 ||
        !Number.isInteger(limit) || limit < 1 || limit > 1000 ||
        !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) {
      throw new Error("Invalid dashboard rate limit");
    }
    await this.initialize();
    const hash = createHmac("sha256", this.secret).update(subject).digest("hex");
    const result = await this.pool.query<{ hits: unknown }>(`INSERT INTO bot_dashboard_rate_limits (scope, subject_hash, hits, expires_at)
      VALUES ($1, $2, 1, NOW() + $3 * INTERVAL '1 second')
      ON CONFLICT (scope, subject_hash) DO UPDATE SET
        hits = CASE WHEN bot_dashboard_rate_limits.expires_at <= NOW() THEN 1 ELSE LEAST(bot_dashboard_rate_limits.hits + 1, $4 + 1) END,
        expires_at = CASE WHEN bot_dashboard_rate_limits.expires_at <= NOW() THEN NOW() + $3 * INTERVAL '1 second' ELSE bot_dashboard_rate_limits.expires_at END
      RETURNING hits`, [scope, hash, windowSeconds, limit]);
    const hits = result.rows[0]?.hits;
    if (typeof hits !== "number" || !Number.isInteger(hits) || hits < 1) throw new Error("Invalid dashboard rate-limit result");
    return hits <= limit;
  }

  public async purgeExpired(): Promise<void> {
    await this.initialize();
    await this.pool.query("DELETE FROM bot_dashboard_rate_limits WHERE expires_at <= NOW()");
  }
}
