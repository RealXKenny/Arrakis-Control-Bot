import { beforeEach, describe, expect, it, vi } from "vitest";

import { data } from "../../../../src/commands/economy/leaderboard/leaderboard";
import {
  CACHE_TTL_MS,
  compareBalances,
  countPages,
  fetchSolariSnapshot,
  formatEntryName,
  formatLeaderboardPage,
  formatSolari,
  getSolariSnapshot,
  parseBalance,
  parseBankCredit,
  parseSolariTotal,
  readId,
  resetSolariSnapshotCache,
  sortEntries,
} from "../../../../src/modules/players/leaderboard/solariLeaderboard";
import { PAGE_SIZE, createLeaderboardCard } from "../../../../src/modules/players/leaderboard/solariLeaderboardBrowser";
import { createLeaderboardSession, getLeaderboardSession } from "../../../../src/modules/players/leaderboard/solariLeaderboardSessions";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../../src/shared/discord/discordLimits";

type Call = (method: string, route: string, options?: { query?: Record<string, unknown>; routeParams?: Record<string, unknown> }) => Promise<unknown>;

function fakeApi(rows: Array<Record<string, unknown>>, balances: Record<string, unknown>, failing: string[] = []) {
  const call = vi.fn<Call>((_method, route, options) => {
    if (route === "/api/players") {
      const page = Number(options?.query?.page);
      const size = Number(options?.query?.pageSize);
      return Promise.resolve({ rows: rows.slice(page * size, (page + 1) * size), totalCount: rows.length });
    }

    const id = String(options?.routeParams?.playerId);
    if (failing.includes(id)) return Promise.reject(new Error("boom"));
    // The bank holds Solari Credit; coins carried come from /solaris-coin. Here every character banks 100.
    if (route === "/api/players/{playerId}/currency")
      return Promise.resolve({ capabilities: { currency: true }, rows: [{ currency_id: 0, balance: "100", label: "Solari Credit" }, { currency_id: 1, balance: "7", label: "Scrip" }] });
    return Promise.resolve({ capabilities: { solarisCoin: true }, total: balances[id] });
  });

  return { call } as unknown as Parameters<typeof fetchSolariSnapshot>[0] & { call: typeof call };
}

beforeEach(() => resetSolariSnapshotCache());

describe("solari leaderboard", () => {
  it("registers a public /leaderboard command with a one-based page option", () => {
    const command = data.toJSON();

    expect(command.name).toBe("leaderboard");
    expect(command.options?.map((option) => option.name)).toEqual(["solaris", "dungeons"]);
    for (const subcommand of command.options ?? []) expect((subcommand as { options?: Array<{ name: string }> }).options?.map((option) => option.name)).toEqual(["page"]);
  });

  it("keeps balances as decimal strings and compares without precision loss", () => {
    expect(parseBalance("9007199254740993")).toBe("9007199254740993");
    expect(parseBalance(1250.9)).toBe("1250");
    expect(parseBalance("12.5")).toBe("12");
    expect(parseBalance("abc")).toBeNull();
    expect(parseBalance(Number.NaN)).toBeNull();
    expect(parseSolariTotal({ total: "42" })).toBe("42");
    expect(parseSolariTotal(null)).toBeNull();
    expect(compareBalances("9007199254740993", "9007199254740992")).toBe(-1);
    expect(formatSolari("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(formatSolari("-1500")).toBe("-1,500");
    expect(formatSolari("0")).toBe("0");
  });

  it("reads banked Solari Credit and the real directory id", () => {
    expect(parseBankCredit({ rows: [{ currency_id: 0, balance: "12533524", label: "Solari Credit" }, { currency_id: 1, balance: "850", label: "House Credit" }] })).toBe("12533524");
    expect(parseBankCredit({ rows: [{ currency_id: 0, balance: 5 }] })).toBe("5");
    expect(parseBankCredit({ rows: [] })).toBe("0");
    expect(parseBankCredit({ capabilities: { currency: false } })).toBeNull();
    expect(readId({ actor_id: 42, player_controller_id: 9 })).toBe("42");
    expect(readId({ player_pawn_id: "43" })).toBe("43");
    expect(readId({ actor_id: 0 })).toBeNull();
  });

  it("sorts descending with deterministic ties", () => {
    const sorted = sortEntries([
      { id: "1", name: "Bravo", bank: "0", coins: "10", balance: "10" },
      { id: "2", name: "Alpha", bank: "0", coins: "10", balance: "10" },
      { id: "3", name: "Whale", bank: "0", coins: "9007199254740993", balance: "9007199254740993" },
    ]);

    expect(sorted.map((entry) => entry.name)).toEqual(["Whale", "Alpha", "Bravo"]);
  });

  it("escapes and truncates player names", () => {
    expect(formatEntryName("*Bold* @everyone")).toContain(String.raw`\*Bold\*`);
    expect(Array.from(formatEntryName("x".repeat(100))).length).toBeLessThanOrEqual(32);
    expect(formatEntryName("a\nb")).toBe("a b");
  });

  it("paginates with ranks across pages", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({ id: String(index), name: `P${index}`, bank: "0", coins: String(1000 - index), balance: String(1000 - index) }));

    expect(countPages(25, 10)).toBe(3);
    expect(countPages(0, 10)).toBe(1);
    expect(formatLeaderboardPage(entries, 1, 10)).toContain("🥇 P0 — **1,000** Solari");
    expect(formatLeaderboardPage(entries, 3, 10)).toContain("**21.** P20");
    expect(formatLeaderboardPage([], 1, 10)).toContain("No players");
  });

  it("pages through the player directory, ranks balances, and counts failures", async () => {
    // The real directory: one row per character, id in actor_id (no player_id at all).
    const rows = Array.from({ length: 150 }, (_, index) => ({ actor_id: index + 1, player_pawn_id: index + 1, character_name: `P${index}` }));
    const balances = Object.fromEntries(rows.map((row, index) => [String(row.actor_id), String(index * 10)]));
    const api = fakeApi([...rows, { garbage: true }, { actor_id: 1, character_name: "Duplicate" }], balances, ["6"]);

    const snapshot = await fetchSolariSnapshot(api);

    expect(snapshot.entries).toHaveLength(149);
    expect(snapshot.failed).toBe(1);
    expect(snapshot.entries[0]).toMatchObject({ name: "P149", bank: "100", coins: "1490", balance: "1590" });
    expect(api.call).toHaveBeenCalledWith("GET", "/api/players", { query: { status: "all", page: 0, pageSize: 100 } });
    expect(api.call).toHaveBeenCalledWith("GET", "/api/players", { query: { status: "all", page: 1, pageSize: 100 } });
  });

  it("fails when no balance can be read or the directory is invalid", async () => {
    await expect(fetchSolariSnapshot(fakeApi([{ actor_id: 1, character_name: "A" }], {}, ["1"]))).rejects.toThrow("No Solari balances");
    // Rows without any usable id mean the directory changed shape; never show an empty board as if it were real.
    await expect(fetchSolariSnapshot(fakeApi([{ character_name: "A" }], {}))).rejects.toThrow("no player id");
    await expect(fetchSolariSnapshot({ call: vi.fn().mockResolvedValue({}) } as never)).rejects.toThrow("Invalid player directory");
  });

  it("caches the snapshot and shares simultaneous crawls", async () => {
    const api = fakeApi([{ actor_id: 1, character_name: "A" }], { "1": "5" });

    await Promise.all([getSolariSnapshot(api, 1_000), getSolariSnapshot(api, 1_000)]);
    await getSolariSnapshot(api, 1_000 + CACHE_TTL_MS - 1);
    expect(api.call).toHaveBeenCalledTimes(3);

    await getSolariSnapshot(api, 1_000 + CACHE_TTL_MS);
    expect(api.call).toHaveBeenCalledTimes(6);
  });

  it("builds a bounded requester-bound card", () => {
    const session = createLeaderboardSession({ ownerId: "user", requestedBy: "Trader".repeat(30), page: 2 });
    session.totalPages = 5;

    const card = createLeaderboardCard("Row\n".repeat(900), "Page 2 of 5", session).toJSON();
    const json = JSON.stringify(card);

    expect(PAGE_SIZE).toBe(10);
    expect(json).toContain(`leaderboard-page:${session.id}:next`);
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(countComponents(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
  });

  it("creates sessions that remember their owner", () => {
    const session = createLeaderboardSession({ ownerId: "owner", requestedBy: "Owner", page: 0 });

    expect(session.page).toBe(1);
    expect(getLeaderboardSession(session.id)?.ownerId).toBe("owner");
    expect(getLeaderboardSession("missing")).toBeNull();
  });
});
