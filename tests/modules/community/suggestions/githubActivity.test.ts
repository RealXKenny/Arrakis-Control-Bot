import { describe, expect, it } from "vitest";
import type { GitHubCommit, GitHubIssue, GitHubRelease } from "../../../../src/infrastructure/http/github/GitHubActivityClient";
import { canAdvance, happenedAfter, referencedThreadIds, releaseBullets, toWorkItems } from "../../../../src/modules/community/suggestions/githubActivity";

const REPO = "RealXKenny/Arrakis-Control-Bot";
const at = new Date("2026-11-20T00:00:00Z");

function issue(overrides: Partial<GitHubIssue>): GitHubIssue {
  return {
    number: 1, title: "Add a spice tracker", body: "", url: "https://github.com/x/y/issues/1", state: "open", stateReason: null, isPullRequest: false, draft: false,
    mergedAt: null, createdAt: at, updatedAt: at, labels: [], authorIsBot: false, ...overrides,
  };
}

describe("toWorkItems", () => {
  it("maps open issues to planned and open or merged pull requests to in progress", () => {
    const items = toWorkItems(REPO, {
      issues: [
        issue({ number: 1 }),
        issue({ number: 2, isPullRequest: true }),
        issue({ number: 3, isPullRequest: true, state: "closed", mergedAt: at }),
        issue({ number: 4, isPullRequest: true, state: "closed" }),
        issue({ number: 5, state: "closed", stateReason: "completed" }),
      ],
      releases: [],
      commits: [],
    });
    expect(items.map((item) => [item.key, item.status, item.ongoing])).toEqual([
      [`issue:${REPO}:1`, "planned", true],
      [`pull:${REPO}:2`, "in_progress", true],
      [`pull:${REPO}:3`, "in_progress", false],
    ]);
    expect(items[2]?.mergedAt).toEqual(at);
  });

  it("skips bots, housekeeping, squash merges and hidden labels", () => {
    const commits: GitHubCommit[] = [
      { sha: "a".repeat(40), message: "Merge pull request #3 from x", url: "https://github.com/c/1", committedAt: at, authorIsBot: false },
      { sha: "b".repeat(40), message: "Add spice tracker (#12)", url: "https://github.com/c/2", committedAt: at, authorIsBot: false },
      { sha: "c".repeat(40), message: "Bump eslint", url: "https://github.com/c/3", committedAt: at, authorIsBot: true },
      { sha: "d".repeat(40), message: "Track spice harvests\n\nDetails", url: "https://github.com/c/4", committedAt: at, authorIsBot: false },
    ];
    const items = toWorkItems(REPO, { issues: [issue({ authorIsBot: true }), issue({ number: 7, labels: ["security"] }), issue({ number: 8, title: "Release 2.0.2" })], releases: [], commits });
    expect(items.map((item) => item.title)).toEqual(["Track spice harvests"]);
  });

  it("splits release notes into one implemented item per bullet", () => {
    const release: GitHubRelease = { tag: "v2.0.2", name: "v2.0.2", body: "## Notes\n- **Spice tracker**: shows `harvests` per [day](https://x)\n- tiny\n* Faster sandworm alerts for scouts", url: "https://github.com/r/1", publishedAt: at };
    const items = toWorkItems(REPO, { issues: [], releases: [release], commits: [] });
    expect(items.map((item) => [item.key, item.text, item.status])).toEqual([
      [`release:${REPO}:v2.0.2:0`, "Spice tracker: shows harvests per day", "implemented"],
      [`release:${REPO}:v2.0.2:1`, "Faster sandworm alerts for scouts", "implemented"],
    ]);
  });
});

describe("autopilot rules", () => {
  it("only moves forward and never past a staff decision", () => {
    expect(canAdvance(undefined, "planned")).toBe(true);
    expect(canAdvance("under_review", "in_progress")).toBe(true);
    expect(canAdvance("in_progress", "planned")).toBe(false);
    expect(canAdvance("in_progress", "in_progress")).toBe(false);
    expect(canAdvance("planned", "implemented")).toBe(true);
    for (const locked of ["back_burner", "not_doing", "implemented"] as const) expect(canAdvance(locked, "implemented")).toBe(false);
  });

  it("matches finished work only to suggestions posted before it", () => {
    const posted = new Date("2026-11-21T00:00:00Z");
    expect(happenedAfter({ at, ongoing: false }, posted)).toBe(false);
    expect(happenedAfter({ at, ongoing: true }, posted)).toBe(true);
    expect(happenedAfter({ at: new Date("2026-11-22T00:00:00Z"), ongoing: false }, posted)).toBe(true);
  });

  it("finds suggestions linked from GitHub text in this guild only", () => {
    const text = "Fixes https://discord.com/channels/100000000000000001/200000000000000001 and https://discord.com/channels/999999999999999999/200000000000000002, suggestion: 200000000000000003";
    expect(referencedThreadIds(text, "100000000000000001")).toEqual(["200000000000000001", "200000000000000003"]);
  });

  it("ignores short or non-bullet release lines", () => {
    expect(releaseBullets("Intro\n- ok\n  - Nested bullet that is long enough")).toEqual(["Nested bullet that is long enough"]);
  });
});
