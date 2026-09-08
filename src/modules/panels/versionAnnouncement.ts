import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type Message, type MessageCreateOptions, type SendableChannels } from "discord.js";

import { createDuneBanner } from "../../shared/factories/imageFactory";

const RELEASE_PROJECTS = [
  { name: "Bot", repo: "RealXKenny/Arrakis-Control-Bot" },
  { name: "Dashboard", repo: "RealXKenny/Arrakis-Control-Dashboard" },
] as const;
type ReleaseProject = (typeof RELEASE_PROJECTS)[number];

const RELEASE_MARKER_REGEX = /^## Arrakis Control(?: Bot| Dashboard)? v\S+/m;
const ANNOUNCEMENT_COLOR = 0xc58b45;
const HISTORY_PAGE_SIZE = 100;

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  created_at: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

interface Release {
  project: ReleaseProject;
  version: string;
  summary: string;
  date: string | null;
  body: string;
  url: string;
}

async function announceCurrentVersion(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId || (process.env.DISCORD_SHARD_ID ?? "0") !== "0") {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot announce releases before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel?.isSendable()) {
    throw new Error(`Version announcement channel ${channelId} is not a sendable channel.`);
  }

  const [releases, history] = await Promise.all([loadReleases(), readChannelHistory(channel)]);

  const announcedMarkers = new Set(history.map(findReleaseMarker).filter((marker): marker is string => marker !== null));

  for (const release of [...releases].reverse()) {
    const marker = `## Arrakis Control ${release.project.name} v${release.version}`;

    if (announcedMarkers.has(marker) || (release.project.name === "Bot" && announcedMarkers.has(`## Arrakis Control v${release.version}`))) {
      continue;
    }

    await sendReleaseAnnouncement(channel, release, marker);
    announcedMarkers.add(marker);
  }
}

async function sendReleaseAnnouncement(channel: SendableChannels, release: Release, marker: string): Promise<void> {
  const roleId = getAnnouncementRoleId();
  const roleMention = roleId ? `<@&${roleId}>` : null;

  const card = buildReleaseCard(release, marker, roleMention);
  const banner = createDuneBanner({
    filename: `arrakis-control-${release.version}.png`,
    title: `${release.project.name} v${release.version}`,
    subtitle: "RELEASE ANNOUNCEMENT",
    detail: "ARRAKIS CONTROL",
  });

  const filename = `arrakis-control-${release.version}.png`;

  const payload: MessageCreateOptions = {
    components: [card],
    files: [
      {
        attachment: banner.attachment,
        name: filename,
        description: banner.description ?? undefined,
      },
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      roles: roleId ? [roleId] : [],
    },
  };

  await channel.send(payload);
}

function buildReleaseCard(release: Release, marker: string, roleMention: string | null): ContainerBuilder {
  const card = new ContainerBuilder()
    .setAccentColor(ANNOUNCEMENT_COLOR)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://arrakis-control-${release.version}.png`)))
    .addTextDisplayComponents((text) => text.setContent(marker))
    .addTextDisplayComponents((text) => text.setContent(`${release.summary}\n\n**Released:** ${formatDiscordTimestamp(release.date)}`));

  if (roleMention) {
    card.addTextDisplayComponents((text) => text.setContent(roleMention));
  }

  card
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("### What changed"))
    .addTextDisplayComponents((text) => text.setContent(release.body.trim() || "No release notes provided."))
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

function getAnnouncementRoleId(): string | null {
  const roleId = process.env.ROLE_ANNOUNCEMENTS_ID;

  if (!roleId || roleId.startsWith("replace_with_")) {
    return null;
  }

  return roleId;
}

function formatDiscordTimestamp(date: string | null): string {
  const timestamp = Date.parse(date ?? "");

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

async function loadReleases(): Promise<Release[]> {
  const releases = await Promise.all(RELEASE_PROJECTS.map(loadProjectReleases));

  return releases.flat().sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
}

async function loadProjectReleases(project: ReleaseProject): Promise<Release[]> {
  const response = await fetch(`https://api.github.com/repos/${project.repo}/releases?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Arrakis-Control",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${project.name} GitHub releases: ${response.status} ${response.statusText}`);
  }

  const releases = (await response.json()) as GitHubRelease[];

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

export { announceCurrentVersion };
