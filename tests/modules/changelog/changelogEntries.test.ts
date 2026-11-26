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
      ["dashboard", "RealXKenny/Arrakis-Control-Dashboard", "2.0.0"],
      ["bot", "RealXKenny/Arrakis-Control-Bot", "1.0.0"],
    ]);
    expect(entries[1].url).toBe("https://dashboard.example/changelog?project=bot&show=all#v1.0.0");
    expect(entries[1].body).toBe("### Fixed\n- A fix");
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
});
