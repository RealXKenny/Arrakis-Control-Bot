import type { Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { buildReleaseCard, parseReleaseMarker, releaseMarker } from "../../../src/modules/changelog/changelogCard";
import type { ChangelogEntry } from "../../../src/modules/changelog/changelogEntries";
import { CHANGELOG_PROJECTS } from "../../../src/modules/changelog/changelogProjects";
import { DISCORD_LIMITS, countDisplayableText } from "../../../src/shared/discord/discordLimits";

vi.mock("../../../src/shared/discord/imageFactory", () => ({ createPanelBanner: () => ({ attachment: Buffer.from("banner") }) }));

const [bot, dashboard] = CHANGELOG_PROJECTS;
const entry = (project = bot, body = "### Fixed\n- A fix"): ChangelogEntry =>
  ({ project, version: "1.2.3", summary: "Summary", date: "2026-01-01", body, url: "https://dashboard.example/changelog" });
const message = (content: string) => ({ content: "", components: [{ components: [{ content }] }] }) as unknown as Message;

describe("changelog card", () => {
  it("states the product on every card and gives each product its own accent", () => {
    const botCard = buildReleaseCard(entry(bot)).toJSON();
    const dashboardCard = buildReleaseCard(entry(dashboard)).toJSON();
    expect(JSON.stringify(botCard)).toContain("-# Discord bot release • RealXKenny/Arrakis-Control-Bot");
    expect(JSON.stringify(dashboardCard)).toContain("-# Web dashboard release • RealXKenny/Arrakis-Control-Dashboard");
    expect(botCard.accent_color).not.toBe(dashboardCard.accent_color);
  });

  it("keeps the durable heading and stays under the aggregate text limit", () => {
    const card = buildReleaseCard(entry(dashboard, "Long note. ".repeat(1000))).toJSON();
    expect(JSON.stringify(card)).toContain("## Arrakis Control Dashboard v1.2.3");
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  });

  it("recognizes current and legacy headings and ignores unknown products", () => {
    expect(parseReleaseMarker(message(releaseMarker(entry(dashboard))))).toEqual({ project: dashboard, version: "1.2.3" });
    expect(parseReleaseMarker(message("## Arrakis Control v1.0.0"))).toEqual({ project: bot, version: "1.0.0" });
    expect(parseReleaseMarker(message("## Arrakis Control Launcher v1.0.0"))).toBeNull();
  });
});
