import { PANEL_COLORS } from "../../shared/discord/panelStyle";

/**
 * Every product whose changelog the bot publishes. This registry is the one place that knows
 * which dashboard project keys exist, how each product is labelled in Discord, and which
 * repository its announcement receipts are stored under.
 *
 * Adding a product: add an entry here once the dashboard API publishes its key. The receipt
 * `repository` and the `name` used in the heading are durable contracts; never rename them
 * for an existing product or old posts will be announced again.
 */
interface ChangelogProject {
  /** Project key in the dashboard changelog API (`release.project`). */
  readonly key: string;
  /** Short name used in the post heading: `## Arrakis Control <name> v<version>`. */
  readonly name: string;
  /** Plain description shown on every post so readers can tell products apart. */
  readonly label: string;
  /** Small emoji shown before the label on release posts. */
  readonly icon: string;
  /** GitHub repository; also the receipt key in `bot_release_announcements`. */
  readonly repository: string;
  readonly accentColor: number;
}

const CHANGELOG_PROJECTS: readonly ChangelogProject[] = Object.freeze([
  Object.freeze({ key: "bot", name: "Bot", label: "Discord bot", icon: "🤖", repository: "RealXKenny/Arrakis-Control-Bot", accentColor: PANEL_COLORS.accent }),
  Object.freeze({ key: "dashboard", name: "Dashboard", label: "Web dashboard", icon: "🖥️", repository: "RealXKenny/Arrakis-Control-Dashboard", accentColor: PANEL_COLORS.info }),
]);

function findChangelogProject(key: string): ChangelogProject | undefined {
  return CHANGELOG_PROJECTS.find((project) => project.key === key);
}

function findChangelogProjectByName(name: string): ChangelogProject | undefined {
  return CHANGELOG_PROJECTS.find((project) => project.name === name);
}

export { CHANGELOG_PROJECTS, findChangelogProject, findChangelogProjectByName };
export type { ChangelogProject };
