import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { HoneypotRepository, InMemoryHoneypotStorage } from "../../../../src/infrastructure/database/honeypot/HoneypotRepository";

const incident = { messageId: "123456789012345678", guildId: "223456789012345678", channelId: "323456789012345678", userId: "423456789012345678", outcome: "ban" as const };
describe("honeypot statistics storage", () => {
  it("deduplicates messages, counts distinct members, and isolates guild/channel totals", async () => {
    const storage = new InMemoryHoneypotStorage();
    await storage.record(incident); await storage.record(incident);
    await storage.record({ ...incident, messageId: "523456789012345678", outcome: "failed" });
    await storage.record({ ...incident, messageId: "623456789012345678", userId: "723456789012345678", outcome: "timeout" });
    await storage.record({ ...incident, messageId: "823456789012345678", outcome: "log" });
    await storage.record({ ...incident, messageId: "923456789012345678", channelId: "other" });
    expect(await storage.stats(incident.guildId, incident.channelId)).toEqual({ members: "2", messages: "4", bans: "1", timeouts: "1", logged: "1", failed: "1" });
    expect((await storage.stats("other", incident.channelId)).messages).toBe("0");
    expect(storage.persistent).toBe(false);
  });
  it("uses idempotent schema setup and parameterized duplicate-safe inserts", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const storage = new HoneypotRepository({ query } as unknown as Pool);
    await storage.initialize(); await storage.record(incident);
    expect(query.mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS");
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("ON CONFLICT (message_id) DO NOTHING"), [incident.messageId, incident.guildId, incident.channelId, incident.userId, "ban"]);
    expect(storage.persistent).toBe(true);
  });
  it("preserves large decimal counts and filters the database query by guild/channel", async () => {
    const stats = { members: "9007199254740993", messages: "9007199254740994", bans: "1", timeouts: "0", logged: "0", failed: "0" };
    const query = vi.fn().mockResolvedValue({ rows: [stats] });
    const storage = new HoneypotRepository({ query } as unknown as Pool);
    expect(await storage.stats(incident.guildId, incident.channelId)).toEqual(stats);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("COUNT(DISTINCT user_id)::text"), [incident.guildId, incident.channelId]);
  });
});
