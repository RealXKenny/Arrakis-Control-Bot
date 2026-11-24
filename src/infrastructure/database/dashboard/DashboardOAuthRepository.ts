import { createHash } from "node:crypto";
import type { Pool } from "pg";

const STATE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9_-]{43}$/;
const OAUTH_TTL_SECONDS = 600;

/** One-time PKCE transactions; raw OAuth state is never stored. */
export class DashboardOAuthRepository {
  private initialized?: Promise<void>;
  public constructor(private readonly pool: Pool) {}

  private async initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS bot_dashboard_oauth_transactions (
      state_hash TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_dashboard_oauth_expiry_idx ON bot_dashboard_oauth_transactions (expires_at);`)
      .then(() => undefined).catch((error: unknown) => { this.initialized = undefined; throw error; });
    await this.initialized;
  }

  public async create(state: string, verifier: string): Promise<void> {
    if (!STATE.test(state) || !VERIFIER.test(verifier)) throw new Error("Invalid OAuth transaction");
    await this.initialize();
    await this.pool.query(
      "INSERT INTO bot_dashboard_oauth_transactions (state_hash, verifier, expires_at) VALUES ($1, $2, NOW() + $3 * INTERVAL '1 second')",
      [hashState(state), verifier, OAUTH_TTL_SECONDS],
    );
  }

  public async consume(state: string): Promise<string | null> {
    if (!STATE.test(state)) return null;
    await this.initialize();
    const result = await this.pool.query<{ verifier: unknown }>(
      "DELETE FROM bot_dashboard_oauth_transactions WHERE state_hash = $1 AND expires_at > NOW() RETURNING verifier",
      [hashState(state)],
    );
    const verifier = result.rows[0]?.verifier;
    if (verifier === undefined) return null;
    if (typeof verifier !== "string" || !VERIFIER.test(verifier)) throw new Error("Invalid stored OAuth transaction");
    return verifier;
  }

  public async purgeExpired(): Promise<void> {
    await this.initialize();
    await this.pool.query("DELETE FROM bot_dashboard_oauth_transactions WHERE expires_at <= NOW()");
  }
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}
