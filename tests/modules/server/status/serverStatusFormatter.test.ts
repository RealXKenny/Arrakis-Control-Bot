import { describe, expect, it } from "vitest";

import { formatServerStatus } from "../../../../src/modules/server/status/serverStatusFormatter";

describe("formatServerStatus", () => {
  it("formats all Console status sources into safe Discord sections", () => {
    const status = { exitCode: 0, stdout: [
      "=== Dune status ===", "Overall: READY", "Title: Arrakis *Prime*", "Region: US-East", "Population: 12/40",
      "=== Containers ===", "SERVICE       STATUS", "game          Up", "database      Up",
      "=== Listeners ===", "CHECK         PORT   STATUS", "Game          7777   OK", "Query         27015  FAIL",
      "=== Game servers ===", "MAP           STATE    UPTIME", "Hagga         Running  2h",
      "=== Automation ===", "Autoscaler: Enabled", "Auto updates: Disabled",
    ].join("\n") };

    const result = formatServerStatus(
      status,
      { cpuPercent: 12.34, memory: { usedBytes: 1024, totalBytes: 2048, percent: 50 }, disk: { usedBytes: 1024 ** 3, totalBytes: 2 * 1024 ** 3, freeBytes: 1024 ** 3, percent: 50 }, uptime: "2 hours", sampledAt: "2026-09-14T18:00:00Z" },
      { stdout: "=== Readiness ===\nOK database\nWARN queue\nFAIL game\nREADY: false", exitCode: 1 },
      { stdout: "Overmap game  0.0.0.0:7777/udp" },
      { stdout: "NAMES  STATUS  PORTS\ndune-game  Up 2 hours  7777/udp" },
    );

    expect(result.healthy).toBe(true);
    expect(result.overview).toContain("Arrakis \\*Prime\\*");
    expect(result.containers).toContain("game  Up");
    expect(result.listeners).toContain("1/2 listeners responding");
    expect(result.gameServers).toContain("Hagga  Running  2h");
    expect(result.automation).toContain("Auto updates:** Disabled");
    expect(result.performance).toContain("**CPU:** 12.3%");
    expect(result.performance).toContain("**Memory:** 1.0 KB / 2.0 KB (50.0%)");
    expect(result.performance).toContain("<t:1789408800:R>");
    expect(result.readiness).toContain("1 OK");
    expect(result.ports).toContain("0.0.0.0:7777/udp");
    expect(result.services).toContain("dune-game");
  });

  it("uses stable fallbacks for absent data and requires a successful READY command", () => {
    const result = formatServerStatus({ stdout: "=== Dune status ===\nOverall: READY", exitCode: 1 });
    expect(result.healthy).toBe(false);
    expect(result.containers).toBe("No data reported.");
    expect(result.listeners).toBe("No listener data reported.");
    expect(result.performance).toBe("No performance data reported.");
    expect(result.readiness).toBe("No readiness data reported.");
    expect(result.ports).toBe("No service port data reported.");
    expect(result.services).toBe("No service data reported.");
  });
});
