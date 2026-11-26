import type { Pool } from "pg";

import type { Migration } from "./migrations";

// Fixed advisory-lock key so two bot processes never migrate at the same time.
const MIGRATION_LOCK_KEY = 0x41524b53; // "ARKS"

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

class SchemaTooNewError extends Error {
  public constructor(public readonly databaseVersion: number, public readonly knownVersion: number) {
    super(`The database schema is at version ${databaseVersion}, but this bot only knows up to ${knownVersion}. Run the newer bot release, or restore a backup taken before the upgrade.`);
    this.name = "SchemaTooNewError";
  }
}

interface MigrationLog {
  info(message: string): void;
}

/**
 * Applies pending migrations in order, each in its own transaction, under a session
 * advisory lock. Refuses to start when the database was migrated by a newer release,
 * so a rollback never runs old code against a schema it does not understand.
 */
async function runMigrations(pool: Pick<Pool, "connect">, migrations: readonly Migration[], log: MigrationLog): Promise<number[]> {
  assertOrdered(migrations);
  const known = migrations.at(-1)?.version ?? 0;
  const client = await pool.connect();
  const applied: number[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      await client.query(CREATE_MIGRATIONS_TABLE);
      const result = await client.query<{ version: number }>("SELECT version FROM schema_migrations");
      const done = new Set(result.rows.map((row) => Number(row.version)));
      const newest = Math.max(0, ...done);
      if (newest > known) throw new SchemaTooNewError(newest, known);

      for (const migration of migrations) {
        if (done.has(migration.version)) continue;
        await client.query("BEGIN");
        try {
          await migration.up(client);
          await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [migration.version, migration.name]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
        applied.push(migration.version);
        log.info(`Applied database migration ${migration.version}: ${migration.name}.`);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
  return applied;
}

function assertOrdered(migrations: readonly Migration[]): void {
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previous) {
      throw new Error(`Migration versions must be whole numbers in increasing order; ${migration.version} follows ${previous}.`);
    }
    previous = migration.version;
  }
}

export { runMigrations, SchemaTooNewError };
