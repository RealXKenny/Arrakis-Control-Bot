import { fetchGitHubReleases } from "../../infrastructure/http/github/GitHubReleaseClient";
import type { ReleaseAnnouncementChannel } from "../../infrastructure/database/releases/ReleaseAnnouncementRepository";
import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type Message, type SendableChannels } from "discord.js";

import { createDuneBanner } from "../../shared/discord/imageFactory";
import { DISCORD_LIMITS, sanitizeAttachmentName, truncateDiscordText } from "../../shared/discord/discordLimits";
import { createLogger } from "../../client/logger";

const RELEASE_PROJECTS = [
  { name: "Bot", repo: "RealXKenny/Arrakis-Control-Bot" },
  { name: "Dashboard", repo: "RealXKenny/Arrakis-Control-Dashboard" },
] as const;
type ReleaseProject = (typeof RELEASE_PROJECTS)[number];

const RELEASE_MARKER_REGEX = /^## Arrakis Control(?: Bot| Dashboard)? v\S+/m;
const ANNOUNCEMENT_COLOR = 0xc58b45;
const HISTORY_PAGE_SIZE = 100;
const DISPLAYABLE_TEXT_SAFETY_MARGIN = 200;
const MAX_RELEASE_SUMMARY_TEXT = 500;
const RELEASE_NOTES_TRUNCATED_NOTICE = "\n\n_Release notes shortened for Discord. Use **View full release notes** below._";
const logger = createLogger("VERSION ANNOUNCEMENTS");

interface Release {
  project: ReleaseProject;
  version: string;
  summary: string;
  date: string | null;
  body: string;
  url: string;
}

async function announceCurrentVersion(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId || !isPrimaryShard()) {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot announce releases before the Discord client is ready.");
  }

  const storage = requireStorage(client);
  const channel = await client.channels.fetch(channelId);

  if (!channel?.isSendable()) {
    throw new Error(`Version announcement channel ${channelId} is not a sendable channel.`);
  }

  await storage.withChannel(channelId, async (stored) => {
    await importExistingAnnouncements(client, channel, stored);
    const { releases, failures } = await loadReleases(client.githubToken);
    await sendUnannouncedReleases(channel, stored, releases, failures);
  });
}

async function replayReleaseAnnouncements(client: Client, channelId: string): Promise<void> {
  if (!client.user) throw new Error("Cannot replay changelogs before the Discord client is ready.");
  const storage = requireStorage(client);
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) throw new Error(`Version announcement channel ${channelId} is not a sendable channel.`);
  let acquired = false;
  await storage.withChannel(channelId, async (stored) => {
    acquired = true;
    // Fetch both sources before changing durable state. A source outage must not erase the ledger.
    const { releases, failures } = await loadReleases(client.githubToken);
    if (failures.length) throw new AggregateError(failures, "Cannot reset changelogs while a release source is unavailable.");
    await stored.reset(RELEASE_PROJECTS.map((project) => project.repo));
    await sendUnannouncedReleases(channel, stored, releases, []);
  });
  if (!acquired) throw new Error("Another release check holds the channel lock; retry the replay later.");
}

async function sendUnannouncedReleases(channel: SendableChannels, stored: ReleaseAnnouncementChannel, releases: Release[], failures: unknown[]): Promise<void> {
  const announced = new Set((await stored.list()).map((row) => releaseKey(row.repository, row.version)));

  for (const release of releases) {
    if (announced.has(releaseKey(release.project.repo, release.version))) continue;
    let message: Message;
    try {
      message = await channel.send({
        ...releasePayload(release, releaseMarker(release)),
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      failures.push(error);
      continue;
    }
    // Save immediately after sending, before optional publication or the next release.
    // A failed database write aborts this batch instead of sending more untracked posts.
    await stored.record({ repository: release.project.repo, version: release.version, messageId: message.id });
    announced.add(releaseKey(release.project.repo, release.version));
    if (message.crosspostable) {
      await message.crosspost().catch((error: unknown) => {
        logger.warn(`Release announcement was sent but could not be published: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} release check operation(s) failed.`);
}

async function refreshReleaseAnnouncements(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId || !isPrimaryShard()) return;
  if (!client.user) throw new Error("Cannot refresh release announcements before the Discord client is ready.");

  const storage = requireStorage(client);
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) throw new Error(`Version announcement channel ${channelId} is not a sendable channel.`);

  await storage.withChannel(channelId, async (stored) => {
    await importExistingAnnouncements(client, channel, stored);
    const { releases, failures } = await loadReleases(client.githubToken);
    const records = new Map((await stored.list()).map((row) => [releaseKey(row.repository, row.version), row]));
    for (const release of releases) {
      const record = records.get(releaseKey(release.project.repo, release.version));
      if (!record) continue;
      try {
        const message = await channel.messages.fetch(record.messageId);
        if (message.author.id !== client.user!.id || message.webhookId) continue;
        await message.edit({ ...releasePayload(release, releaseMarker(release)), attachments: [] });
      } catch (error) {
        // Deleted announcements stay recorded so deletion never triggers a repost.
        if (typeof error === "object" && error !== null && "code" in error && error.code === 10008) continue;
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, `${failures.length} release operation(s) could not be refreshed.`);
  });
}

function requireStorage(client: Client) {
  if (!client.releaseAnnouncements) throw new Error("Release announcements require DATABASE_URL; posting is paused to prevent untracked duplicates.");
  return client.releaseAnnouncements;
}

function releaseKey(repository: string, version: string): string { return `${repository}:${version}`; }
function releaseMarker(release: Release): string { return `## Arrakis Control ${release.project.name} v${release.version}`; }

async function importExistingAnnouncements(client: Client, channel: SendableChannels, stored: ReleaseAnnouncementChannel): Promise<void> {
  if (await stored.isImported()) return;
  // One-time upgrade: retain existing announcements before switching to database-only checks.
  const history = await readChannelHistory(channel);
  for (const message of history) {
    if (message.author.id !== client.user!.id || message.webhookId) continue;
    const marker = findReleaseMarker(message);
    const match = marker?.match(/^## Arrakis Control(?: (Bot|Dashboard))? v(\S+)$/);
    if (!match) continue;
    const project = RELEASE_PROJECTS.find((project) => project.name === (match[1] ?? "Bot"))!;
    await stored.record({ repository: project.repo, version: match[2], messageId: message.id });
  }
  await stored.markImported();
}

function releasePayload(release: Release, marker: string) {
  const filename = sanitizeAttachmentName(`arrakis-control-${release.version}.png`, "arrakis-control-release.png");
  const banner = createDuneBanner({
    artwork: "release",
    filename,
    title: `${release.project.name} v${release.version}`,
    subtitle: "RELEASE ANNOUNCEMENT",
    detail: "ARRAKIS CONTROL",
  });
  return {
    components: [buildReleaseCard(release, marker)],
    files: [{ attachment: banner.attachment, name: filename, description: banner.description ?? undefined }],
    allowedMentions: { parse: [] as const },
  };
}

function buildReleaseCard(release: Release, marker: string): ContainerBuilder {
  const summary = truncateDiscordText(release.summary, MAX_RELEASE_SUMMARY_TEXT, "…");
  const releaseMetadata = `${summary}\n\n**Released:** ${formatDiscordTimestamp(release.date)}`;
  const changeHeading = "### What changed";
  const fixedDisplayableText = marker.length + releaseMetadata.length + changeHeading.length;
  const releaseNotesBudget = Math.max(0, DISCORD_LIMITS.componentDisplayableText - DISPLAYABLE_TEXT_SAFETY_MARGIN - fixedDisplayableText);
  const releaseNotes = truncateDiscordText(release.body.trim() || "No release notes provided.", releaseNotesBudget, RELEASE_NOTES_TRUNCATED_NOTICE);
  const card = new ContainerBuilder()
    .setAccentColor(ANNOUNCEMENT_COLOR)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${sanitizeAttachmentName(`arrakis-control-${release.version}.png`, "arrakis-control-release.png")}`)))
    .addTextDisplayComponents((text) => text.setContent(marker))
    .addTextDisplayComponents((text) => text.setContent(releaseMetadata));

  card
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(changeHeading))
    .addTextDisplayComponents((text) => text.setContent(releaseNotes))
    .addActionRowComponents((row) => row.addComponents(
      new ButtonBuilder().setLabel("View full release notes").setStyle(ButtonStyle.Link).setURL(release.url),
      new ButtonBuilder().setLabel(`${release.project.name} GitHub`).setStyle(ButtonStyle.Link).setURL(`https://github.com/${release.project.repo}`),
    ));

  return card;
}

function findReleaseMarker(message: Message): string | null {
  const contents = [message.content, ...getComponentContents(message)];

  for (const content of contents) {
    const match = content.match(RELEASE_MARKER_REGEX);

    if (match) {
      return match[0];
    }
  }

  return null;
}

function getComponentContents(message: Message): string[] {
  const contents: string[] = [];

  for (const component of message.components) {
    if (!("components" in component)) {
      continue;
    }

    for (const child of component.components) {
      if ("content" in child && typeof child.content === "string") {
        contents.push(child.content);
      }
    }
  }

  return contents;
}

function formatDiscordTimestamp(date: string | null): string {
  const timestamp = Date.parse(date ?? "");

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

async function loadReleases(token?: string): Promise<{ releases: Release[]; failures: unknown[] }> {
  const results = await Promise.allSettled(RELEASE_PROJECTS.map((project) => loadProjectReleases(project, token)));
  const releases = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  if (results.every((result) => result.status === "rejected")) {
    throw new AggregateError(failures, "Could not fetch releases from either GitHub repository.");
  }
  return { releases: releases.sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0)), failures };
}

async function loadProjectReleases(project: ReleaseProject, token?: string): Promise<Release[]> {
  const releases = await fetchGitHubReleases(project.repo, token);

  return releases
    .filter(({ draft, prerelease }) => !draft && !prerelease)
    .map((release) => ({
      project,
      version: release.tag_name.replace(/^v/, ""),
      summary: release.name || `A new ${project.name.toLowerCase()} version is available.`,
      date: release.published_at || release.created_at,
      body: release.body || "",
      url: release.html_url,
    }));
}

async function readChannelHistory(channel: SendableChannels): Promise<Message[]> {
  const messages: Message[] = [];
  let before: string | undefined;

  while (true) {
    const page = await channel.messages.fetch({
      limit: HISTORY_PAGE_SIZE,
      ...(before ? { before } : {}),
    });

    messages.push(...page.values());

    if (page.size < HISTORY_PAGE_SIZE) {
      break;
    }

    const lastMessage = page.last();

    if (!lastMessage) {
      break;
    }

    before = lastMessage.id;
  }

  return messages;
}

export { announceCurrentVersion, buildReleaseCard, refreshReleaseAnnouncements, replayReleaseAnnouncements };
