import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ReleaseAnnouncementRepository } from "../../../../src/infrastructure/database/releases/ReleaseAnnouncementRepository";

function setup(locked = true) {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const connectionQuery = vi.fn().mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes("pg_try_advisory_lock") ? [{ locked }] : [] }));
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query: connectionQuery, release });
  const repository = new ReleaseAnnouncementRepository({ query, connect } as unknown as Pool);
  return { repository, query, connectionQuery, release };
}

describe("release announcement persistence", () => {
  it("resets only the selected channel/repositories and preserves the import marker atomically", async () => {
    const { repository, connectionQuery } = setup();
    await repository.withChannel("announcements", async (stored) => { await stored.reset(["owner/bot", "owner/dashboard"]); });
    expect(connectionQuery).toHaveBeenCalledWith("BEGIN");
    expect(connectionQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO bot_release_announcement_channels"), ["announcements"]);
    expect(connectionQuery).toHaveBeenCalledWith("DELETE FROM bot_release_announcements WHERE channel_id=$1 AND repository=ANY($2::text[])", ["announcements", ["owner/bot", "owner/dashboard"]]);
    expect(connectionQuery).toHaveBeenCalledWith("COMMIT");
    expect(connectionQuery.mock.calls.some(([sql]) => /bot_persistent_panels|TRUNCATE/.test(sql))).toBe(false);
  });

  it("rolls the reset back if deletion fails", async () => {
    const { repository, connectionQuery } = setup();
    await expect(repository.withChannel("announcements", async (stored) => {
      connectionQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("delete failed"));
      await stored.reset(["owner/bot"]);
    })).rejects.toThrow("delete failed");
    expect(connectionQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(connectionQuery).not.toHaveBeenCalledWith("COMMIT");
  });
  it("creates the schema once and stores parameterized channel/repository/version/message records", async () => {
    const { repository, query, connectionQuery } = setup();
    await repository.withChannel("channel", async (stored) => {
      expect(await stored.isImported()).toBe(false);
      await stored.record({ repository: "owner/repo", version: "1.0.0", messageId: "message" });
      await stored.markImported();
    });
    await repository.withChannel("other", async (stored) => { await stored.list(); });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("PRIMARY KEY (channel_id, repository, version)");
    expect(connectionQuery).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (channel_id, repository, version) DO NOTHING"), ["channel", "owner/repo", "1.0.0", "message"]);
    expect(connectionQuery).toHaveBeenCalledWith(expect.stringContaining("FROM bot_release_announcements WHERE channel_id=$1"), ["other"]);
    expect(connectionQuery).not.toHaveBeenCalledWith("BEGIN");
  });

  it("skips an overlapping check while another connection holds the channel lock", async () => {
    const { repository, connectionQuery, release } = setup(false);
    const task = vi.fn();
    await repository.withChannel("channel", task);
    expect(task).not.toHaveBeenCalled();
    expect(connectionQuery).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(false);
  });

  it("always unlocks after a failed send or write without rolling back previous records", async () => {
    const { repository, connectionQuery, release } = setup();
    await expect(repository.withChannel("channel", () => Promise.reject(new Error("failure")))).rejects.toThrow("failure");
    expect(connectionQuery).toHaveBeenLastCalledWith(expect.stringContaining("pg_advisory_unlock"), ["release-announcements:channel"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("discards the connection when unlocking fails", async () => {
    const { repository, connectionQuery, release } = setup();
    await repository.withChannel("channel", () => {
      connectionQuery.mockRejectedValueOnce(new Error("connection lost"));
      return Promise.resolve();
    });
    expect(release).toHaveBeenCalledWith(true);
  });

  it("retries schema initialization after a database outage", async () => {
    const { repository, query } = setup();
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(repository.withChannel("channel", vi.fn())).rejects.toThrow("database unavailable");
    await repository.withChannel("channel", vi.fn());
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("reads import status and persisted message IDs", async () => {
    const { repository, connectionQuery } = setup();
    await repository.withChannel("channel", async (stored) => {
      connectionQuery.mockResolvedValueOnce({ rows: [{ channel_id: "channel" }] });
      expect(await stored.isImported()).toBe(true);
      connectionQuery.mockResolvedValueOnce({ rows: [{ repository: "owner/repo", version: "1.0.0", message_id: "message" }] });
      expect(await stored.list()).toEqual([{ repository: "owner/repo", version: "1.0.0", messageId: "message" }]);
    });
  });
});
