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
];

export { MIGRATIONS };
export type { Migration };
