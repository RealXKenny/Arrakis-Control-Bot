import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PanelRepository } from "../../../../src/infrastructure/database/panels/PanelRepository";

function setup(locked = true) {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const connectionQuery = vi.fn().mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes("pg_try_advisory_lock") ? [{ locked }] : [] }));
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query: connectionQuery, release });
  const repository = new PanelRepository({ query, connect } as unknown as Pool);
  return { repository, query, connectionQuery, release };
}

describe("persistent panel repository", () => {
  it("initializes once and parameterizes panel upserts independently by channel and key", async () => {
    const { repository, query, connectionQuery } = setup();
    await repository.withPanel("channel", "rules", async (session) => {
      expect(await session.get()).toBeNull();
      await session.save("message", "rendered");
    });
    await repository.withPanel("other", "rules", async (session) => { await session.save(null); });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("PRIMARY KEY (channel_id, panel_key)");
    expect(connectionQuery).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (channel_id, panel_key) DO UPDATE"), ["channel", "rules", "message", "rendered"]);
    expect(connectionQuery).toHaveBeenCalledWith(expect.stringContaining("VALUES ($1,$2,$3,$4)"), ["other", "rules", null, null]);
    expect(connectionQuery).not.toHaveBeenCalledWith("BEGIN");
  });

  it("returns durable message IDs and rendering state", async () => {
    const { repository, connectionQuery } = setup();
    await repository.withPanel("channel", "storm", async (session) => {
      connectionQuery.mockResolvedValueOnce({ rows: [{ message_id: "message", render_key: "cycle:active" }] });
      expect(await session.get()).toEqual({ messageId: "message", renderKey: "cycle:active" });
      expect(connectionQuery).toHaveBeenLastCalledWith(expect.stringContaining("WHERE channel_id=$1 AND panel_key=$2"), ["channel", "storm"]);
    });
  });

  it("skips publication when another process holds the lock", async () => {
    const { repository, release } = setup(false);
    const task = vi.fn();
    await repository.withPanel("channel", "rules", task);
    expect(task).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(false);
  });

  it("unlocks and releases the connection after a publication failure", async () => {
    const { repository, connectionQuery, release } = setup();
    await expect(repository.withPanel("channel", "rules", () => Promise.reject(new Error("failed")))).rejects.toThrow("failed");
    expect(connectionQuery).toHaveBeenLastCalledWith(expect.stringContaining("pg_advisory_unlock"), ["persistent-panel:channel:rules"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("discards a session after an uncertain lock acquisition", async () => {
    const { repository, connectionQuery, release } = setup();
    connectionQuery.mockRejectedValueOnce(new Error("connection lost"));
    await expect(repository.withPanel("channel", "rules", vi.fn())).rejects.toThrow("connection lost");
    expect(release).toHaveBeenCalledWith(true);
  });

  it("discards a session whose lock cannot be released", async () => {
    const { repository, connectionQuery, release } = setup();
    await repository.withPanel("channel", "rules", () => {
      connectionQuery.mockRejectedValueOnce(new Error("unlock failed"));
      return Promise.resolve();
    });
    expect(release).toHaveBeenCalledWith(true);
  });

  it("allows retry after schema initialization fails", async () => {
    const { repository, query } = setup();
    query.mockRejectedValueOnce(new Error("offline"));
    await expect(repository.withPanel("channel", "rules", vi.fn())).rejects.toThrow("offline");
    await repository.withPanel("channel", "rules", vi.fn());
    expect(query).toHaveBeenCalledTimes(2);
  });
});
