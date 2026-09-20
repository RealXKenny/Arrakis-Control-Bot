import type { Pool } from "pg";
import type { Track } from "shoukaku";

export interface MusicQueueEntry { id: string; track: Track; requester: string }
export interface MusicState {
  current?: MusicQueueEntry;
  queue: MusicQueueEntry[];
  position: number;
  paused: boolean;
  volume: number;
}
export interface MusicStorage {
  initialize(): Promise<void>;
  load(guildId: string): Promise<MusicState | undefined>;
  save(guildId: string, state: MusicState): Promise<void>;
}

export class MusicRepository implements MusicStorage {
  public constructor(private readonly pool: Pool) {}
  public async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS bot_music_state (
      guild_id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }
  public async load(guildId: string): Promise<MusicState | undefined> {
    const result = await this.pool.query<{ state: MusicState }>("SELECT state FROM bot_music_state WHERE guild_id = $1", [guildId]);
    const state = result.rows[0]?.state;
    if (!state) return undefined;
    // Dev note: Inspect the mixtape before trusting it with the speakers.
    const entryValid = (entry: MusicQueueEntry) => entry && typeof entry.id === "string" && typeof entry.requester === "string" &&
      typeof entry.track?.encoded === "string" && typeof entry.track.info?.title === "string" && typeof entry.track.info.identifier === "string";
    if (!Array.isArray(state.queue) || !state.queue.every(entryValid) || (state.current && !entryValid(state.current)) ||
      !Number.isFinite(state.position) || state.position < 0 || typeof state.paused !== "boolean" ||
      !Number.isInteger(state.volume) || state.volume < 0 || state.volume > 100) throw new Error("Invalid saved music state; refusing to overwrite it.");
    return state;
  }
  public async save(guildId: string, state: MusicState): Promise<void> {
    await this.pool.query(`INSERT INTO bot_music_state (guild_id, state) VALUES ($1, $2::jsonb)
      ON CONFLICT (guild_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`, [guildId, JSON.stringify(state)]);
  }
}
