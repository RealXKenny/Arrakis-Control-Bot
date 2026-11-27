import type { ChangelogSnapshot } from "../../infrastructure/http/dashboard/DashboardChangelogClient";
import { CHANGELOG_PROJECTS, findChangelogProject, type ChangelogProject } from "./changelogProjects";

/** What the changelog module needs from the dashboard API client. */
interface ChangelogSource {
  readonly origin: string;
  getReleases(force?: boolean): Promise<ChangelogSnapshot>;
}

/** One release of one product, ready to publish. */
interface ChangelogEntry {
  project: ChangelogProject;
  version: string;
  summary: string;
  date: string | null;
  body: string;
  url: string;
}

/**
 * Read every known product's releases from the dashboard API in publishing order: version by version,
 * oldest first, and within one version the products in registry order (bot, then dashboard).
 * Stale or incomplete snapshots throw, so callers never post or reset receipts from partial data.
 * Releases for project keys the bot does not know yet are skipped rather than treated as errors,
 * so the dashboard can publish a new product before the bot is updated.
 */
async function loadChangelogEntries(source: ChangelogSource | undefined, force = false): Promise<ChangelogEntry[]> {
  if (!source) throw new Error("DASHBOARD_URL is required for release announcements.");
  const snapshot = await source.getReleases(force);
  if (snapshot.stale) throw new Error("Dashboard changelog is unavailable; cached release data is stale.");
  if (CHANGELOG_PROJECTS.some((project) => !snapshot.releases.some((release) => release.project === project.key))) {
    throw new Error("Dashboard changelog is missing a project; release announcements are paused.");
  }
  const entries: ChangelogEntry[] = [];
  for (const release of snapshot.releases) {
    const project = findChangelogProject(release.project);
    if (!project) continue;
    entries.push({
      project,
      version: release.version,
      summary: release.title,
      date: release.date,
      body: release.sections.map((section) => `### ${sectionHeading(section.title)}\n${section.items.map((item) => `- ${item}`).join("\n")}`).join("\n\n"),
      url: `${source.origin}/changelog?project=${encodeURIComponent(project.key)}&show=all#v${encodeURIComponent(release.version)}`,
    });
  }
  return entries.sort(comparePublishingOrder);
}

/** Small icons for the usual changelog sections, so long notes are easy to scan. Unknown sections keep a plain title. */
const SECTION_ICONS: Readonly<Record<string, string>> = Object.freeze({
  added: "✨", new: "✨", features: "✨", changed: "🔧", improved: "🔧", improvements: "🔧", updated: "🔧",
  fixed: "🐛", fixes: "🐛", removed: "🗑️", deprecated: "⚠️", security: "🔒", performance: "⚡",
});

function sectionHeading(title: string): string {
  const icon = SECTION_ICONS[title.trim().toLowerCase()];
  return icon ? `${icon} ${title}` : title;
}

/** Numeric parts of a version such as `2.0.10` or `v2.1.0-beta`; empty when it has none. */
function versionParts(version: string): number[] {
  const match = /^v?(\d+(?:\.\d+)*)/.exec(version.trim());
  return match ? match[1].split(".").map(Number) : [];
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.localeCompare(b, "en", { numeric: true });
}

/**
 * Total order so every run, shard and restart posts in the same sequence: version by version, oldest
 * first, so the bot and dashboard posts of one release sit next to each other (Bot 2.0.0, Dashboard
 * 2.0.0, Bot 2.0.1, ...). Within a version the registry decides (the bot before the dashboard). A
 * version only one product shipped simply posts alone in its place. Date breaks any remaining tie.
 */
function comparePublishingOrder(a: ChangelogEntry, b: ChangelogEntry): number {
  const byVersion = compareVersions(a.version, b.version);
  if (byVersion !== 0) return byVersion;
  const byProject = CHANGELOG_PROJECTS.indexOf(a.project) - CHANGELOG_PROJECTS.indexOf(b.project);
  if (byProject !== 0) return byProject;
  return (Date.parse(a.date ?? "") || 0) - (Date.parse(b.date ?? "") || 0);
}

export { compareVersions, loadChangelogEntries };
export type { ChangelogEntry };
