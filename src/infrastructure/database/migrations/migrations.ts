import type { PoolClient } from "pg";

interface Migration {
  /** Strictly increasing whole number. Never renumber or edit a released migration. */
  readonly version: number;
  readonly name: string;
  up(client: PoolClient): Promise<void>;
}

/**
 * Ordered schema changes. Version 1 records the schema that each repository's idempotent
 * `initialize` creates as of V2; those stay in place so an optional feature enabled later
 * still gets its tables. Every schema change after V2 is added here as a new version.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "v2 baseline (tables created by repository initializers)",
    up: () => Promise.resolve(),
  },
  {
    version: 2,
    name: "remove release announcement receipts from before 2.0.0",
    // Release history starts at 2.0.0. Only changelog bookkeeping is touched; the table is
    // created lazily by its repository, so an install that never announced has nothing to clean.
    up: async (client) => {
      await client.query(`DO $$
        BEGIN
          IF to_regclass('bot_release_announcements') IS NOT NULL THEN
            DELETE FROM bot_release_announcements WHERE version !~ '^v?([2-9]|[1-9][0-9]+)[.]';
          END IF;
        END $$`);
    },
  },
  {
    version: 3,
    name: "chatbot answers taught by staff",
    up: async (client) => {
      // Same table the ChatbotRepository initializer creates; both are idempotent.
      await client.query(`CREATE TABLE IF NOT EXISTS chatbot_answers (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        uses INTEGER NOT NULL DEFAULT 0
      )`);
      await client.query("CREATE INDEX IF NOT EXISTS chatbot_answers_guild_idx ON chatbot_answers (guild_id, id)");
    },
  },
];

export { MIGRATIONS };
export type { Migration };
