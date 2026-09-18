import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { VoiceRepository, type VoiceRoom } from "../../../src/infrastructure/database/voice/VoiceRepository";

it("creates durable tables with one room per owner and unique Discord channel IDs", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await new VoiceRepository({ query } as unknown as Pool).initialize();
  const sql = query.mock.calls[0][0];
  expect(sql).toContain("PRIMARY KEY (guild_id, owner_id)");
  expect(sql).toContain("channel_id TEXT UNIQUE");
  expect(sql).toContain("creation_key TEXT NOT NULL UNIQUE");
  expect(sql).toContain("role_permissions JSONB");
});

it("uses parameterized reservations and does not overwrite an existing owner", async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ owner_id: "owner" }] }).mockResolvedValueOnce({ rows: [] });
  const repo = new VoiceRepository({ query } as unknown as Pool);
  const room: VoiceRoom = { guild_id: "guild", owner_id: "owner", channel_id: null, category_id: "category", creation_key: "jtc-id", role_permissions: [] };
  await expect(repo.reserve(room)).resolves.toBe(true);
  await expect(repo.reserve(room)).resolves.toBe(false);
  expect(query.mock.calls[0][0]).toContain("ON CONFLICT (guild_id, owner_id) DO NOTHING");
  expect(query.mock.calls[0][1]).toEqual(["guild", "owner", "category", "jtc-id", "[]"]);
  await repo.attach(room, "channel");
  await repo.remove(room);
  expect(query.mock.calls[2][1]).toEqual(["jtc-id", "channel"]);
  expect(query.mock.calls[3][1]).toEqual(["jtc-id"]);
});
