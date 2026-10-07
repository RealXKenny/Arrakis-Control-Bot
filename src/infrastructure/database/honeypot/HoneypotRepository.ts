import type { Pool } from "pg";

type HoneypotOutcome = "ban" | "timeout" | "log" | "failed";
interface HoneypotIncident { messageId: string; guildId: string; channelId: string; userId: string; outcome: HoneypotOutcome }
interface HoneypotStats { members: string; messages: string; bans: string; timeouts: string; logged: string; failed: string }
interface HoneypotStorage {
  readonly persistent: boolean;
  initialize(): Promise<void>;
  record(incident: HoneypotIncident): Promise<void>;
  stats(guildId: string, channelId: string): Promise<HoneypotStats>;
}

class HoneypotRepository implements HoneypotStorage {
  public readonly persistent = true;
  public constructor(private readonly pool: Pool) {}
  public async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS bot_honeypot_incidents (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('ban','timeout','log','failed')),
      caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS bot_honeypot_incidents_channel ON bot_honeypot_incidents (guild_id, channel_id);`);
  }
  public async record(incident: HoneypotIncident): Promise<void> {
    await this.pool.query(`INSERT INTO bot_honeypot_incidents (message_id,guild_id,channel_id,user_id,outcome)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (message_id) DO NOTHING`, [incident.messageId, incident.guildId, incident.channelId, incident.userId, incident.outcome]);
  }
  public async stats(guildId: string, channelId: string): Promise<HoneypotStats> {
    const result = await this.pool.query<HoneypotStats>(`SELECT COUNT(DISTINCT user_id)::text AS members, COUNT(*)::text AS messages,
      COUNT(*) FILTER (WHERE outcome='ban')::text AS bans, COUNT(*) FILTER (WHERE outcome='timeout')::text AS timeouts,
      COUNT(*) FILTER (WHERE outcome='log')::text AS logged, COUNT(*) FILTER (WHERE outcome='failed')::text AS failed
      FROM bot_honeypot_incidents WHERE guild_id=$1 AND channel_id=$2`, [guildId, channelId]);
    return result.rows[0];
  }
}

class InMemoryHoneypotStorage implements HoneypotStorage {
  public readonly persistent = false;
  private readonly incidents = new Map<string, HoneypotIncident>();
  public initialize(): Promise<void> { return Promise.resolve(); }
  public record(incident: HoneypotIncident): Promise<void> {
    if (!this.incidents.has(incident.messageId)) this.incidents.set(incident.messageId, incident);
    return Promise.resolve();
  }
  public stats(guildId: string, channelId: string): Promise<HoneypotStats> {
    const records = [...this.incidents.values()].filter((row) => row.guildId === guildId && row.channelId === channelId);
    const count = (outcome: HoneypotOutcome) => String(records.filter((row) => row.outcome === outcome).length);
    return Promise.resolve({ members: String(new Set(records.map((row) => row.userId)).size), messages: String(records.length), bans: count("ban"), timeouts: count("timeout"), logged: count("log"), failed: count("failed") });
  }
}

export { HoneypotRepository, InMemoryHoneypotStorage };
export type { HoneypotOutcome, HoneypotIncident, HoneypotStats, HoneypotStorage };
