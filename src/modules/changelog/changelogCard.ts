import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorSpacingSize, type Message } from "discord.js";

import { DISCORD_LIMITS, sanitizeAttachmentName, truncateDiscordText } from "../../shared/discord/discordLimits";
import { createPanelBanner } from "../../shared/discord/imageFactory";
import type { ChangelogEntry } from "./changelogEntries";
import { CHANGELOG_PROJECTS, findChangelogProjectByName, type ChangelogProject } from "./changelogProjects";

const DISPLAYABLE_TEXT_SAFETY_MARGIN = 200;
const MAX_RELEASE_SUMMARY_TEXT = 500;
const RELEASE_NOTES_TRUNCATED_NOTICE = "\n\n_Release notes shortened for Discord. Use **View full release notes** on the announcement._";
/** Release notes are posted as several thread messages; past this many the last one is shortened instead. */
const MAX_RELEASE_MESSAGES = 25;
const FORUM_NOTICE = "-# 📜 The full release notes follow in this post.";
const THREAD_NOTICE = "-# 📜 The full release notes are in the thread below.";
/** Headline in old announcements that carried the notes themselves; repair moves those notes into a thread. */
const LEGACY_NOTES_HEADING = "### What changed";
const NO_RELEASE_NOTES = "No release notes provided.";
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

/** Major for x.0.0, minor for x.y.0, patch otherwise; anything unparseable has no type. */
function releaseType(version: string): "Major" | "Minor" | "Patch" | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  if (match[3] !== "0") return "Patch";
  return match[2] !== "0" ? "Minor" : "Major";
}

/** One subtext line under the heading: which product, what kind of release, and when. */
function productLine(entry: ChangelogEntry): string {
  const type = releaseType(entry.version);
  const timestamp = Date.parse(entry.date ?? "");
  const parts = [`${entry.project.icon} ${entry.project.label}`, type ? `${type} release` : undefined, Number.isNaN(timestamp) ? undefined : `<t:${Math.floor(timestamp / 1000)}:D>`];
  return `-# ${parts.filter(Boolean).join("  ·  ")}`;
}

/** "✨ Added **3**  ·  🐛 Fixed **2**": a one-line overview of what the notes below contain. */
function sectionOverview(body: string): string | null {
  const counts: [string, number][] = [];
  for (const line of body.split("\n")) {
    if (line.startsWith("### ")) counts.push([line.slice(4).trim(), 0]);
    else if (/^\s*[-*] /.test(line) && counts.length) counts[counts.length - 1][1]++;
  }
  const shown = counts.filter(([, count]) => count > 0);
  if (!shown.length) return null;
  return truncateDiscordText(shown.map(([title, count]) => `${title} **${count}**`).join("  ·  "), MAX_RELEASE_SUMMARY_TEXT, "…");
}

function githubReleaseUrl(entry: ChangelogEntry): string {
  const tag = entry.version.startsWith("v") ? entry.version : `v${entry.version}`;
  return `https://github.com/${entry.project.repository}/releases/tag/${encodeURIComponent(tag)}`;
}

function bannerName(entry: ChangelogEntry): string {
  return sanitizeAttachmentName(`arrakis-control-${entry.project.key}-${entry.version}.png`, "arrakis-control-release.png");
}

/** The channel announcement: banner, durable heading, product, summary, date and links. The notes go in its thread. */
function releasePayload(entry: ChangelogEntry, place: "forum" | "thread" = "thread") {
  const filename = bannerName(entry);
  const banner = createPanelBanner({
    artwork: "release",
    filename,
    title: `${entry.project.name} v${entry.version}`,
    subtitle: `${entry.project.label} release`,
    detail: releaseType(entry.version) ? `${releaseType(entry.version)} release` : "Release notes",
  });
  return {
    components: [buildReleaseCard(entry, place)],
    files: [{ attachment: banner.attachment, name: filename, description: banner.description ?? undefined }],
    allowedMentions: { parse: [] as const },
  };
}

/**
 * The full notes, in order, as thread messages that each fit Discord's aggregate text limit.
 * None carries the release heading, so history import and receipts still see one post per release.
 */
function releaseNoteMessages(entry: ChangelogEntry) {
  const parts = splitReleaseNotes(entry.body.trim() || NO_RELEASE_NOTES, noteBudget(entry), noteBudget(entry));
  return parts.map((notes, index) => ({
    components: [buildNotesCard(entry, notes, index + 1, parts.length)],
    allowedMentions: { parse: [] as const },
  }));
}

/** Forum post (or notes thread) title: product, version and the release headline; Discord allows 100 characters. */
function releaseThreadName(entry: Pick<ChangelogEntry, "project" | "version"> & Partial<Pick<ChangelogEntry, "summary">>): string {
  const headline = entry.summary?.replace(/\s+/g, " ").trim();
  return truncateDiscordText(`${entry.project.name} v${entry.version}${headline ? ` · ${headline}` : ""}`, 100, "…");
}

/** True for a post or thread title this bot gives release posts, current or older style. */
function isReleaseThreadName(name: string): boolean {
  return new RegExp(`^(?:${PROJECT_NAMES}) v\\d`).test(name);
}

/** True for an announcement from before notes moved to threads: its notes are in the card and may be cut short. */
function hasInlineNotes(message: Message): boolean {
  return componentContents(message).includes(LEGACY_NOTES_HEADING);
}

/** The visible text of a notes message, used to tell whether a thread already holds the expected notes. */
function notesMessageText(message: Message | ReturnType<typeof releaseNoteMessages>[number]): string {
  if ("author" in message) return componentContents(message).join("\n");
  return message.components.flatMap((card) => card.toJSON().components).map((component) => ("content" in component && typeof component.content === "string" ? component.content : "")).filter(Boolean).join("\n");
}

/** Recognize a notes message for this release (any part), so repair never touches other thread messages. */
function isNotesMessage(message: Message, entry: Pick<ChangelogEntry, "project" | "version">): boolean {
  const label = `-# ${entry.project.name} v${entry.version} release notes`;
  return componentContents(message).some((content) => content === label || content.startsWith(`${label}, part `));
}

/** The release headline as a quote; an empty headline falls back to a plain line. */
function releaseSummary(entry: ChangelogEntry): string {
  const summary = truncateDiscordText(entry.summary.replace(/\s+/g, " ").trim(), MAX_RELEASE_SUMMARY_TEXT, "…");
  return summary ? `> ${summary}` : "> A new release is out.";
}

function noteBudget(entry: ChangelogEntry): number {
  return DISCORD_LIMITS.componentDisplayableText - DISPLAYABLE_TEXT_SAFETY_MARGIN - continuationLabel(entry, MAX_RELEASE_MESSAGES, MAX_RELEASE_MESSAGES).length;
}

function continuationLabel(entry: ChangelogEntry, part: number, total: number): string {
  const label = `-# ${entry.project.name} v${entry.version} release notes`;
  return total > 1 ? `${label}, part ${part} of ${total}` : label;
}

/**
 * Split release notes on line boundaries into parts that each fit their message. A section heading
 * that spills over is repeated as "(continued)" so every part reads on its own. A single line longer
 * than a part is broken on a word boundary.
 */
function splitReleaseNotes(notes: string, firstBudget: number, restBudget: number): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  let length = 0;
  let heading: string | undefined;
  // True while the part holds nothing but a repeated "(continued)" heading.
  let onlyRepeatedHeading = false;
  const budget = () => (parts.length === 0 ? firstBudget : restBudget);
  const push = (line: string) => {
    current.push(line);
    length += Array.from(line).length + 1;
  };
  const startNextPart = (nextLine: string) => {
    while (current.length && !current[current.length - 1].trim()) current.pop();
    // Never leave a heading stranded at the bottom of a part: carry it to the next one.
    const carried = current.length > 1 && current[current.length - 1].startsWith("### ") ? current.pop() : undefined;
    parts.push(current.join("\n").trim());
    current = [];
    length = 0;
    const repeated = carried ?? (heading && !nextLine.startsWith("### ") ? `${heading} (continued)` : undefined);
    onlyRepeatedHeading = Boolean(repeated);
    if (repeated) push(repeated);
  };

  // Dev note: one spice harvester never fits in one cargo hold; we send a convoy, in order.
  for (const rawLine of notes.split("\n")) {
    if (rawLine.startsWith("### ")) heading = rawLine;
    if (!rawLine.trim()) {
      if (length > 0 && length + 1 <= budget()) push("");
      continue;
    }
    let line = rawLine;
    while (line) {
      if (length + Array.from(line).length + 1 <= budget()) {
        push(line);
        onlyRepeatedHeading = false;
        break;
      }
      if (length > 0 && !onlyRepeatedHeading) {
        startNextPart(line);
        continue;
      }
      // Even a fresh part cannot hold this line: break it on a word boundary.
      const fitted = truncateDiscordText(line, Math.max(1, budget() - length - 1), "").trimEnd() || Array.from(line)[0];
      push(fitted);
      onlyRepeatedHeading = false;
      line = Array.from(line).slice(Array.from(fitted).length).join("").trimStart();
      if (line) startNextPart(line);
    }
  }
  if (current.length && !onlyRepeatedHeading) parts.push(current.join("\n").trim());
  const nonEmpty = parts.filter(Boolean);
  if (nonEmpty.length === 0) return [NO_RELEASE_NOTES];
  if (nonEmpty.length <= MAX_RELEASE_MESSAGES) return nonEmpty;
  const kept = nonEmpty.slice(0, MAX_RELEASE_MESSAGES);
  kept[kept.length - 1] = truncateDiscordText(`${kept[kept.length - 1]}\n${nonEmpty[MAX_RELEASE_MESSAGES]}`, restBudget, RELEASE_NOTES_TRUNCATED_NOTICE);
  return kept;
}

function buildReleaseCard(entry: ChangelogEntry, place: "forum" | "thread" = "thread"): ContainerBuilder {
  const card = new ContainerBuilder()
    .setAccentColor(entry.project.accentColor)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerName(entry)}`)))
    .addTextDisplayComponents((text) => text.setContent(releaseMarker(entry)))
    .addTextDisplayComponents((text) => text.setContent(productLine(entry)))
    .addTextDisplayComponents((text) => text.setContent(releaseSummary(entry)));
  const overview = sectionOverview(entry.body);
  if (overview) {
    card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(`**In this release**\n${overview}`));
  }
  return card
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(place === "forum" ? FORUM_NOTICE : THREAD_NOTICE))
    .addActionRowComponents((row) => row.addComponents(
      new ButtonBuilder().setLabel("Full changelog").setEmoji("📜").setStyle(ButtonStyle.Link).setURL(entry.url),
      new ButtonBuilder().setLabel("GitHub release").setEmoji("🔗").setStyle(ButtonStyle.Link).setURL(githubReleaseUrl(entry)),
    ));
}

/** One part of a release's notes, with a small footer naming the release. It has no release heading, so it is never mistaken for a new post. */
function buildNotesCard(entry: ChangelogEntry, notes: string, part: number, total: number): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(entry.project.accentColor)
    .addTextDisplayComponents((text) => text.setContent(notes))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
    .addTextDisplayComponents((text) => text.setContent(continuationLabel(entry, part, total)));
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

export { MAX_RELEASE_MESSAGES, buildReleaseCard, hasInlineNotes, isNotesMessage, isReleaseThreadName, releaseType, notesMessageText, parseReleaseMarker, releaseMarker, releaseNoteMessages, releasePayload, releaseThreadName, splitReleaseNotes };
