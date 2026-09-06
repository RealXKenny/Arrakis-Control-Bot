import { describe, expect, it } from "vitest";

import { formatPlayers } from "../src/modules/formatters/players";

describe("formatPlayers", () => {
  it("formats supported player list response shapes", () => {
    const result = formatPlayers(
      {
        total: 2,
        players: [
          { characterName: "Paul", playerId: 7 },
          { character_name: "Chani", total_playtime_seconds: 3_600 },
        ],
      },
      "online",
    );

    expect(result.heading).toBe("Online Players (2)");
    expect(result.content).toContain("Paul");
    expect(result.content).toContain("1h 0m played");
  });

  it("handles malformed external responses without throwing", () => {
    const result = formatPlayers({ players: [null, "invalid"] }, "offline");

    expect(result.heading).toBe("Offline Players (0)");
    expect(result.content).toBe("No players found.");
  });
});
