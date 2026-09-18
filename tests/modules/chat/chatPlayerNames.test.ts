import { afterEach, expect, it, vi } from "vitest";
import { ChatPlayerNames } from "../../../src/modules/chat/ChatPlayerNames";

afterEach(() => vi.useRealTimers());
const player = { funcom_id: "Player#1234", character_name: "Desert Walker", online_status: "Online" };

it("matches exact Funcom IDs and shares cached requests between messages", async () => {
  const call = vi.fn().mockResolvedValue({ rows: [player], totalCount: 1 });
  const names = new ChatPlayerNames({ call });
  expect(await Promise.all([names.resolve(player.funcom_id), names.resolve(player.funcom_id)])).toEqual(["Desert Walker", "Desert Walker"]);
  expect(await names.resolve("Player#123")).toBe("Player#123");
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith("GET", "/api/players", { query: { page: 0, pageSize: 200, status: "all" } });
});

it("looks beyond the first zero-based page", async () => {
  const call = vi.fn().mockResolvedValueOnce({ rows: Array.from({ length: 200 }, (_, i) => ({ ...player, funcom_id: `Other#${i}` })), totalCount: 201 })
    .mockResolvedValueOnce({ rows: [player], totalCount: 201 });
  expect(await new ChatPlayerNames({ call }).resolve(player.funcom_id)).toBe("Desert Walker");
  expect(call).toHaveBeenLastCalledWith("GET", "/api/players", { query: { page: 1, pageSize: 200, status: "all" } });
});

it("prefers the online character and refuses ambiguous or invalid names", async () => {
  const call = vi.fn().mockResolvedValue({ rows: [
    { ...player, character_name: "Old Character", online_status: "Offline" }, player,
    { ...player, funcom_id: "Ambiguous#1", character_name: "A" },
    { ...player, funcom_id: "Ambiguous#1", character_name: "B" },
    { ...player, funcom_id: "Invalid#1", character_name: "bad\nname" },
  ] });
  const names = new ChatPlayerNames({ call });
  expect(await names.resolve(player.funcom_id)).toBe("Desert Walker");
  expect(await names.resolve("Ambiguous#1")).toBe("Ambiguous#1");
  expect(await names.resolve("Invalid#1")).toBe("Invalid#1");
});

it("refreshes character renames after one minute", async () => {
  vi.useFakeTimers();
  const call = vi.fn().mockResolvedValue({ rows: [player] });
  const names = new ChatPlayerNames({ call });
  expect(await names.resolve(player.funcom_id)).toBe("Desert Walker");
  call.mockResolvedValue({ rows: [{ ...player, character_name: "New Name" }] });
  await vi.advanceTimersByTimeAsync(60_001);
  expect(await names.resolve(player.funcom_id)).toBe("New Name");
});

it("falls back on API failure with a cooldown before trying again", async () => {
  vi.useFakeTimers();
  const call = vi.fn().mockRejectedValue(new Error("403"));
  const names = new ChatPlayerNames({ call });
  expect(await names.resolve(player.funcom_id)).toBe(player.funcom_id);
  expect(await names.resolve(player.funcom_id)).toBe(player.funcom_id);
  expect(call).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15_001);
  call.mockResolvedValue({ rows: [player] });
  expect(await names.resolve(player.funcom_id)).toBe("Desert Walker");
});

it("does not delay chat indefinitely while a shared lookup is pending", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  const call = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const names = new ChatPlayerNames({ call });
  const result = names.resolve(player.funcom_id);
  await vi.advanceTimersByTimeAsync(1_500);
  expect(await result).toBe(player.funcom_id);
  finish({ rows: [player] });
  expect(await names.resolve(player.funcom_id)).toBe("Desert Walker");
  expect(call).toHaveBeenCalledTimes(1);
});

it("bounds refresh work and rejects malformed responses", async () => {
  const call = vi.fn().mockResolvedValue({ rows: Array(200).fill(player), totalCount: 100_000 });
  expect(await new ChatPlayerNames({ call }).resolve(player.funcom_id)).toBe(player.funcom_id);
  expect(call).toHaveBeenCalledTimes(25);
  call.mockResolvedValue({ players: [player] });
  expect(await new ChatPlayerNames({ call }).resolve(player.funcom_id)).toBe(player.funcom_id);
});
