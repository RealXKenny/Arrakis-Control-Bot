import { beforeEach, describe, expect, it, vi } from "vitest";

import { dungeonName, formatDungeonPage, formatDuration, getDungeonSnapshot, parseDungeonBoard, resetDungeonSnapshotCache } from "../../../../src/modules/players/leaderboard/dungeonLeaderboard";
import { createLeaderboardSession } from "../../../../src/modules/players/leaderboard/solariLeaderboardSessions";

const entry = (dungeonId: string, difficulty: number, durationMs: number, party: Array<string | null>, runCount = 3) => ({
  runCount,
  best: { completionId: 1, dungeonId, difficulty, durationMs, playerCount: party.length, party: party.map((characterName) => ({ controllerId: 1, actorId: 2, characterName })) },
});

beforeEach(() => resetDungeonSnapshotCache());

describe("dungeon leaderboard", () => {
  it("names dungeons and formats times like the dashboard", () => {
    expect(dungeonName("DA_Dgn_089_Radiation")).toBe("Radiation");
    expect(dungeonName("DA_Dgn_012_OldCistern")).toBe("Old Cistern");
    expect(formatDuration(754_300)).toBe("12:34.3");
    expect(formatDuration(3_754_300)).toBe("1:02:34.3");
  });

  it("parses the Console board, keeps only names and sorts by dungeon then difficulty", () => {
    const snapshot = parseDungeonBoard({ entries: [entry("DA_Dgn_089_Radiation", 2, 754_300, ["Chani", null]), entry("DA_Dgn_012_OldCistern", 1, 60_000, ["*Paul*"], 1)] }, 5);
    expect(snapshot.records.map((record) => record.dungeonId)).toEqual(["DA_Dgn_012_OldCistern", "DA_Dgn_089_Radiation"]);
    expect(JSON.stringify(snapshot)).not.toContain("controllerId");
    const page = formatDungeonPage(snapshot.records, 1, 10);
    expect(page).toContain("**Old Cistern** · Difficulty 1 — ⏱️ **1:00.0**");
    expect(page).toContain(String.raw`\*Paul\*`);
    expect(page).toContain("Chani, Unknown character · 3 runs");
    expect(formatDungeonPage([], 1, 10)).toContain("No dungeon runs");
  });

  it("reports unsupported servers and rejects malformed boards", () => {
    expect(parseDungeonBoard({ capabilities: { dungeons: false } }).supported).toBe(false);
    expect(() => parseDungeonBoard({ entries: [{ runCount: 1, best: { dungeonId: "../x" } }] })).toThrow();
    expect(() => parseDungeonBoard(null)).toThrow();
  });

  it("caches for five minutes and shares one request", async () => {
    const call = vi.fn().mockResolvedValue({ entries: [entry("DA_Dgn_089_Radiation", 2, 1_000, ["A"])] });
    const api = { call } as never;
    await Promise.all([getDungeonSnapshot(api, 1_000), getDungeonSnapshot(api, 1_000)]);
    await getDungeonSnapshot(api, 1_000 + 60_000);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("GET", "/api/dungeons/leaderboard");
  });

  it("remembers which board a session shows", () => {
    expect(createLeaderboardSession({ ownerId: "a", requestedBy: "A", kind: "dungeons" }).kind).toBe("dungeons");
    expect(createLeaderboardSession({ ownerId: "a", requestedBy: "A" }).kind).toBe("solaris");
  });
});
