import { describe, expect, it, vi } from "vitest";

import { loadChangelogEntries } from "../../../src/modules/changelog/changelogEntries";

function source(releases: unknown[], stale = false) {
  return { origin: "https://dashboard.example", getReleases: vi.fn().mockResolvedValue({ stale, fetchedAt: 0, releases }) };
}
const release = (project: string, version: string, date: string | null) =>
  ({ project, id: `${project}:${version}`, version, title: `${project} ${version}`, date, sections: [{ title: "Fixed", items: ["A fix"] }] });

describe("changelog entries", () => {
  it("tags each entry with its product and links to that product's history", async () => {
    const entries = await loadChangelogEntries(source([release("bot", "1.0.0", "2026-01-01"), release("dashboard", "2.0.0", "2026-02-01")]));
    expect(entries.map((entry) => [entry.project.key, entry.project.repository, entry.version])).toEqual([
      ["bot", "RealXKenny/Arrakis-Control-Bot", "1.0.0"],
      ["dashboard", "RealXKenny/Arrakis-Control-Dashboard", "2.0.0"],
    ]);
    expect(entries[0].url).toBe("https://dashboard.example/changelog?project=bot&show=all#v1.0.0");
    expect(entries[0].body).toBe("### Fixed\n- A fix");
  });

  it("skips products the bot does not know yet", async () => {
    const entries = await loadChangelogEntries(source([release("bot", "1.0.0", null), release("dashboard", "1.0.0", null), release("launcher", "1.0.0", null)]));
    expect(entries.map((entry) => entry.project.key).sort()).toEqual(["bot", "dashboard"]);
  });

  it("fails closed without a source, with stale data, or with a missing product", async () => {
    await expect(loadChangelogEntries(undefined)).rejects.toThrow("DASHBOARD_URL");
    await expect(loadChangelogEntries(source([], true))).rejects.toThrow("stale");
    await expect(loadChangelogEntries(source([release("bot", "1.0.0", null)]))).rejects.toThrow("missing a project");
  });

  it("forwards forced refreshes to the source", async () => {
    const dashboard = source([release("bot", "1.0.0", null), release("dashboard", "1.0.0", null)]);
    await loadChangelogEntries(dashboard, true);
    expect(dashboard.getReleases).toHaveBeenCalledWith(true);
  });

  it("posts every bot release before the dashboard, each product oldest to newest, regardless of API order", async () => {
    const releases = [
      release("dashboard", "1.2.0", "2026-03-01"), release("dashboard", "2.0.0", "2026-02-01"), release("bot", "1.10.0", "2026-03-01"),
      release("bot", "1.9.0", "2026-03-01"), release("bot", "1.0.0", null), release("bot", "2.0.0", "2026-04-01"),
    ];
    const forward = await loadChangelogEntries(source(releases));
    const backward = await loadChangelogEntries(source([...releases].reverse()));
    const order = (entries: typeof forward) => entries.map((entry) => `${entry.project.key}@${entry.version}`);
    expect(order(forward)).toEqual(["bot@1.0.0", "bot@1.9.0", "bot@1.10.0", "bot@2.0.0", "dashboard@2.0.0", "dashboard@1.2.0"]);
    expect(order(backward)).toEqual(order(forward));
  });
});
