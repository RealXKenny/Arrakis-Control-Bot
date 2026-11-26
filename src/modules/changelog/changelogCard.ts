import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorSpacingSize, type Message } from "discord.js";

import { DISCORD_LIMITS, sanitizeAttachmentName, truncateDiscordText } from "../../shared/discord/discordLimits";
import { createPanelBanner } from "../../shared/discord/imageFactory";
import type { ChangelogEntry } from "./changelogEntries";
import { CHANGELOG_PROJECTS, findChangelogProjectByName, type ChangelogProject } from "./changelogProjects";

const DISPLAYABLE_TEXT_SAFETY_MARGIN = 200;
const MAX_RELEASE_SUMMARY_TEXT = 500;
const RELEASE_NOTES_TRUNCATED_NOTICE = "\n\n_Release notes shortened for Discord. Use **View full release notes** below._";
const PROJECT_NAMES = CHANGELOG_PROJECTS.map((project) => project.name).join("|");
// `## Arrakis Control v1.2.3` (no product name) is the legacy bot heading from before the dashboard was announced.
const RELEASE_MARKER_REGEX = new RegExp(`^## Arrakis Control(?: (${PROJECT_NAMES}))? v(\\S+)$`, "m");
const LEGACY_PROJECT_NAME = "Bot";

/** The heading that identifies a release post. Also used to recognize posts during the one-time history import. */
function releaseMarker(entry: Pick<ChangelogEntry, "project" | "version">): string {
  return `## Arrakis Control ${entry.project.name} v${entry.version}`;
}

/** Recognize a bot-authored release post and say which product and version it announced. */
function parseReleaseMarker(message: Message): { project: ChangelogProject; version: string } | null {
  for (const content of [message.content, ...componentContents(message)]) {
    const match = content.match(RELEASE_MARKER_REGEX);
    if (!match) continue;
    const project = findChangelogProjectByName(match[1] ?? LEGACY_PROJECT_NAME);
    if (project) return { project, version: match[2] };
  }
  return null;
}

/** Product line under the heading, so every post states which product it belongs to. */
function productLine(project: ChangelogProject): string {
  return `-# ${project.label} release • ${project.repository}`;
}

function bannerName(entry: ChangelogEntry): string {
  return sanitizeAttachmentName(`arrakis-control-${entry.project.key}-${entry.version}.png`, "arrakis-control-release.png");
}

function releasePayload(entry: ChangelogEntry) {
  const filename = bannerName(entry);
  const banner = createPanelBanner({
    artwork: "release",
    filename,
    title: `${entry.project.name} v${entry.version}`,
    subtitle: `${entry.project.label} release`,
    detail: "Release notes",
  });
  return {
    components: [buildReleaseCard(entry)],
    files: [{ attachment: banner.attachment, name: filename, description: banner.description ?? undefined }],
    allowedMentions: { parse: [] as const },
  };
}

function buildReleaseCard(entry: ChangelogEntry): ContainerBuilder {
  const marker = releaseMarker(entry);
  const product = productLine(entry.project);
  const summary = truncateDiscordText(entry.summary, MAX_RELEASE_SUMMARY_TEXT, "…");
  const releaseMetadata = `${summary}\n\n**Date:** ${formatDiscordTimestamp(entry.date)}`;
  const changeHeading = "### What changed";
  const fixedDisplayableText = marker.length + product.length + releaseMetadata.length + changeHeading.length;
  const releaseNotesBudget = Math.max(0, DISCORD_LIMITS.componentDisplayableText - DISPLAYABLE_TEXT_SAFETY_MARGIN - fixedDisplayableText);
  // Dev note: release notes are like spice rations; everyone gets some, nobody gets all 4,000.
  const releaseNotes = truncateDiscordText(entry.body.trim() || "No release notes provided.", releaseNotesBudget, RELEASE_NOTES_TRUNCATED_NOTICE);

  return new ContainerBuilder()
    .setAccentColor(entry.project.accentColor)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerName(entry)}`)))
    .addTextDisplayComponents((text) => text.setContent(marker))
    .addTextDisplayComponents((text) => text.setContent(product))
    .addTextDisplayComponents((text) => text.setContent(releaseMetadata))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(changeHeading))
    .addTextDisplayComponents((text) => text.setContent(releaseNotes))
    .addActionRowComponents((row) => row.addComponents(
      new ButtonBuilder().setLabel("View full release notes").setStyle(ButtonStyle.Link).setURL(entry.url),
      new ButtonBuilder().setLabel(`${entry.project.name} GitHub`).setStyle(ButtonStyle.Link).setURL(`https://github.com/${entry.project.repository}`),
    ));
}

function componentContents(message: Message): string[] {
  const contents: string[] = [];
  for (const component of message.components) {
    if (!("components" in component)) continue;
    for (const child of component.components) {
      if ("content" in child && typeof child.content === "string") contents.push(child.content);
    }
  }
  return contents;
}

function formatDiscordTimestamp(date: string | null): string {
  const timestamp = Date.parse(date ?? "");
  return Number.isNaN(timestamp) ? "Unknown" : `<t:${Math.floor(timestamp / 1000)}:F>`;
}

export { buildReleaseCard, parseReleaseMarker, releaseMarker, releasePayload };
