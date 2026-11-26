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
 * Read every known product's releases from the dashboard API in publishing order:
 * all bot releases first, then the dashboard (registry order), each product oldest to newest.
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
      body: release.sections.map((section) => `### ${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`).join("\n\n"),
      url: `${source.origin}/changelog?project=${encodeURIComponent(project.key)}&show=all#v${encodeURIComponent(release.version)}`,
    });
  }
  return entries.sort(comparePublishingOrder);
}

/**
 * Total order so every run, shard and restart posts in the same sequence. Products follow the
 * registry (the bot always before the dashboard), so a launch that ships both reads bot first.
 * Within a product, releases go oldest to newest by date, then version (numeric-aware), so the
 * newest release lands at the bottom of the channel where members read first. Undated releases
 * sort as oldest.
 */
function comparePublishingOrder(a: ChangelogEntry, b: ChangelogEntry): number {
  const byProject = CHANGELOG_PROJECTS.indexOf(a.project) - CHANGELOG_PROJECTS.indexOf(b.project);
  if (byProject !== 0) return byProject;
  const byDate = (Date.parse(a.date ?? "") || 0) - (Date.parse(b.date ?? "") || 0);
  if (byDate !== 0) return byDate;
  return a.version.localeCompare(b.version, "en", { numeric: true });
}

export { loadChangelogEntries };
export type { ChangelogEntry };
