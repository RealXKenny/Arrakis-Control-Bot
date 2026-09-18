import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { MusicRepository, type MusicState } from "../../../src/infrastructure/database/music/MusicRepository";

it("stores and restores the JSON state without interpolating guild IDs into SQL", async () => {
  const state: MusicState = { queue: [], position: 0, paused: true, volume: 45 };
  const query = vi.fn().mockResolvedValue({ rows: [{ state }] });
  const repository = new MusicRepository({ query } as unknown as Pool);
  await repository.save("guild'", state);
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("ON CONFLICT"), ["guild'", JSON.stringify(state)]);
  expect(await repository.load("guild'")).toEqual(state);
  expect(query).toHaveBeenLastCalledWith(expect.any(String), ["guild'"]);
});

it("rejects corrupted checkpoints rather than silently treating them as empty queues", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ state: { queue: [], position: -1, paused: false, volume: 30 } }] });
  const repository = new MusicRepository({ query } as unknown as Pool);
  await expect(repository.load("guild")).rejects.toThrow("refusing to overwrite");
  expect(query).toHaveBeenCalledOnce();
});
