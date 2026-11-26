import { describe, expect, it, vi } from "vitest";

import { runMigrations, SchemaTooNewError } from "../../../../src/infrastructure/database/migrations/MigrationRunner";
import { MIGRATIONS, type Migration } from "../../../../src/infrastructure/database/migrations/migrations";

function fakePool(appliedVersions: number[]) {
  const statements: string[] = [];
  const client = {
    query: vi.fn((sql: string) => {
      statements.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
      if (sql.startsWith("SELECT version")) return Promise.resolve({ rows: appliedVersions.map((version) => ({ version })) });
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, client, statements };
}

const log = { info: vi.fn() };
const migration = (version: number, up = vi.fn().mockResolvedValue(undefined)): Migration => ({ version, name: `m${version}`, up });

describe("runMigrations", () => {
  it("applies only pending migrations, each in a transaction, under the advisory lock", async () => {
    const { pool, client, statements } = fakePool([1]);
    const second = migration(2);
    const applied = await runMigrations(pool as never, [migration(1), second], log);
    expect(applied).toEqual([2]);
    expect(second.up).toHaveBeenCalledWith(client);
    expect(statements[0]).toBe("SELECT pg_advisory_lock($1)");
    expect(statements).toContain("BEGIN");
    expect(statements).toContain("COMMIT");
    expect(statements.at(-1)).toBe("SELECT pg_advisory_unlock($1)");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and stops on a failed migration, still unlocking", async () => {
    const { pool, client, statements } = fakePool([]);
    const third = migration(3);
    await expect(runMigrations(pool as never, [migration(1, vi.fn().mockRejectedValue(new Error("bad sql"))), third], log)).rejects.toThrow("bad sql");
    expect(statements).toContain("ROLLBACK");
    expect(third.up).not.toHaveBeenCalled();
    expect(statements.at(-1)).toBe("SELECT pg_advisory_unlock($1)");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("refuses to run against a schema from a newer release", async () => {
    const { pool } = fakePool([1, 2, 7]);
    await expect(runMigrations(pool as never, [migration(1), migration(2)], log)).rejects.toBeInstanceOf(SchemaTooNewError);
  });

  it("rejects out-of-order migration lists", async () => {
    const { pool } = fakePool([]);
    await expect(runMigrations(pool as never, [migration(2), migration(1)], log)).rejects.toThrow("increasing order");
  });

  it("ships an ordered migration list starting at the baseline", () => {
    expect(MIGRATIONS[0]?.version).toBe(1);
    expect(MIGRATIONS.map((entry) => entry.version)).toEqual([...MIGRATIONS.map((entry) => entry.version)].sort((a, b) => a - b));
  });

  it("removes only pre-2.0.0 release announcement receipts, and only when the table exists", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const cleanup = MIGRATIONS.find((entry) => entry.version === 2);
    await cleanup?.up({ query } as never);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("to_regclass('bot_release_announcements') IS NOT NULL");
    expect(sql).toContain("DELETE FROM bot_release_announcements WHERE version !~ '^v?([2-9]|[1-9][0-9]+)[.]'");
    expect(query).toHaveBeenCalledOnce();
  });
});
