import { describe, expect, it, vi } from "vitest";
import type { GitHubIssue } from "../../../../src/infrastructure/http/github/GitHubActivityClient";
import { GitHubRateLimitedError } from "../../../../src/infrastructure/http/github/GitHubActivityClient";
import { SuggestionAutopilot } from "../../../../src/modules/community/suggestions/SuggestionAutopilot";

const at = new Date("2026-11-20T00:00:00Z");
const pull = (number: number): GitHubIssue => ({
  number, title: `Spice tracker part ${number}`, body: "", url: `https://github.com/o/r/pull/${number}`, state: "open", stateReason: null, isPullRequest: true, draft: false,
  mergedAt: null, createdAt: at, updatedAt: at, labels: [], authorIsBot: false,
});

function setup(issues: GitHubIssue[] = [], releases = [{ tag: "v2", name: "v2", body: "", url: "https://github.com/o/r/releases/v2", publishedAt: at }]) {
  const github = { issues: vi.fn().mockResolvedValue(issues), releases: vi.fn().mockResolvedValue(releases), commits: vi.fn().mockResolvedValue([]) };
  const service = { matchWork: vi.fn().mockReturnValue([{ threadId: "t1", explicit: false }]), applyWork: vi.fn().mockResolvedValue("moved") };
  const storage = { unshippedThreadIds: vi.fn().mockResolvedValue(["t2"]) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const autopilot = new SuggestionAutopilot(service as never, github, storage, { repos: ["o/r"], intervalMs: 60_000, threshold: 0.3, maxMoves: 2 }, logger);
  return { autopilot, github, service, storage, logger };
}

describe("SuggestionAutopilot", () => {
  it("applies matched work and ships merged work with the newest release", async () => {
    const { autopilot, service, storage } = setup([pull(1)]);
    await expect(autopilot.runOnce()).resolves.toEqual({ moved: 2, linked: 0, deferred: 0 });
    expect(service.applyWork).toHaveBeenNthCalledWith(1, "t1", expect.objectContaining({ key: "pull:o/r:1", status: "in_progress" }), false);
    expect(storage.unshippedThreadIds).toHaveBeenCalledWith("o/r", at, 50);
    expect(service.applyWork).toHaveBeenNthCalledWith(2, "t2", expect.objectContaining({ key: "release:o/r:v2", status: "implemented" }), true);
  });

  it("caps moves per pass and leaves the rest for the next one", async () => {
    const { autopilot, service } = setup([pull(1), pull(2), pull(3)]);
    await expect(autopilot.runOnce()).resolves.toEqual({ moved: 2, linked: 0, deferred: 2 });
    expect(service.applyWork).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one suggestion fails", async () => {
    const { autopilot, service, logger } = setup([pull(1), pull(2)], []);
    service.applyWork.mockRejectedValueOnce(new Error("Missing Access")).mockResolvedValue("linked");
    await expect(autopilot.runOnce()).resolves.toEqual({ moved: 0, linked: 1, deferred: 0 });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Missing Access"));
  });

  it("logs a rate-limit pause once and tries again on a later tick", async () => {
    vi.useFakeTimers();
    try {
      const { autopilot, github, logger } = setup();
      github.issues.mockRejectedValue(new GitHubRateLimitedError(Date.now() + 60_000));
      autopilot.start();
      await vi.advanceTimersByTimeAsync(30_000 + 60_000 * 2);
      expect(github.issues).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      autopilot.stop();
      await vi.advanceTimersByTimeAsync(60_000 * 3);
      expect(github.issues).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
