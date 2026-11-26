import type { Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { MAX_RELEASE_MESSAGES, buildReleaseCard, hasInlineNotes, parseReleaseMarker, releaseMarker, releaseNoteMessages, releaseThreadName, splitReleaseNotes } from "../../../src/modules/changelog/changelogCard";
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

  it("keeps the durable heading, points to the thread and leaves the notes out of the announcement", () => {
    const card = buildReleaseCard(entry(dashboard, "Long note. ".repeat(1000))).toJSON();
    expect(JSON.stringify(card)).toContain("## Arrakis Control Dashboard v1.2.3");
    expect(JSON.stringify(card)).toContain("Full release notes are in the thread below.");
    expect(JSON.stringify(card)).not.toContain("Long note.");
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  });

  it("recognizes old announcements that carried their notes inline", () => {
    expect(hasInlineNotes(message("### What changed"))).toBe(true);
    expect(hasInlineNotes(message(releaseMarker(entry(bot))))).toBe(false);
  });

  it("names the notes thread after the product and version", () => {
    expect(releaseThreadName(entry(dashboard))).toBe("Dashboard v1.2.3 release notes");
  });

  it("recognizes current and legacy headings and ignores unknown products", () => {
    expect(parseReleaseMarker(message(releaseMarker(entry(dashboard))))).toEqual({ project: dashboard, version: "1.2.3" });
    expect(parseReleaseMarker(message("## Arrakis Control v1.0.0"))).toEqual({ project: bot, version: "1.0.0" });
    expect(parseReleaseMarker(message("## Arrakis Control Launcher v1.0.0"))).toBeNull();
  });

  it("keeps short notes in one message", () => {
    expect(releaseNoteMessages(entry(bot))).toHaveLength(1);
  });

  it("splits long notes on line boundaries and repeats the section heading on each continuation", () => {
    const items = Array.from({ length: 120 }, (_, index) => `- Change number ${index} with some descriptive text to fill the line.`);
    const body = `### Added\n${items.slice(0, 60).join("\n")}\n\n### Fixed\n${items.slice(60).join("\n")}`;
    const messages = releaseNoteMessages(entry(dashboard, body));
    expect(messages.length).toBeGreaterThan(1);
    const texts = messages.map((payload) => payload.components[0].toJSON()).map((card) => {
      expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
      return JSON.stringify(card);
    });
    for (const [index, text] of texts.entries()) {
      expect(text).toContain(`Dashboard v1.2.3 release notes, part ${index + 1} of ${messages.length}`);
      expect(text).toMatch(/### (Added|Fixed)/);
      expect(text).not.toContain("## Arrakis Control");
      expect(parseReleaseMarker(message(JSON.parse(text).components.map((c: { content?: string }) => c.content ?? "").join("\n")))).toBeNull();
    }
    const joined = texts.join("");
    for (const item of items) expect(joined.split(item.slice(2)).length - 1).toBe(1);
  });

  it("never strands a heading at the end of a part", () => {
    const parts = splitReleaseNotes(`${"- filler line\n".repeat(6)}### Fixed\n- First fix`, 80, 80);
    for (const part of parts) expect(part.trimEnd().split("\n").at(-1)).not.toMatch(/^### /);
    expect(parts.at(-1)).toContain("### Fixed\n- First fix");
  });

  it("breaks a single oversized line and caps the number of messages", () => {
    const huge = splitReleaseNotes(`### Changed\n- ${"word ".repeat(100)}`, 120, 120);
    expect(huge.length).toBeLessThanOrEqual(MAX_RELEASE_MESSAGES);
    for (const part of huge) expect(Array.from(part).length).toBeLessThanOrEqual(120);
    const capped = splitReleaseNotes("- line of text\n".repeat(500), 100, 100);
    expect(capped).toHaveLength(MAX_RELEASE_MESSAGES);
    expect(capped.at(-1)).toContain("Release notes shortened for Discord");
  });

  it("keeps blank notes readable", () => {
    expect(splitReleaseNotes("", 100, 100)).toEqual(["No release notes provided."]);
  });
});
