import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type Message, type MessageCreateOptions, type SendableChannels } from "discord.js";

import { createDuneBanner } from "../../shared/factories/imageFactory.js";

const GITHUB_REPO = "RealXKenny/Arrakis-Control-Bot";
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`;

const RELEASE_MARKER_REGEX = /^## Arrakis Control v\S+/m;
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
    const marker = `## Arrakis Control v${release.version}`;

    if (announcedMarkers.has(marker)) {
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
    title: `Version ${release.version}`,
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
    .addActionRowComponents((row) => row.addComponents(new ButtonBuilder().setLabel("View full release notes").setStyle(ButtonStyle.Link).setURL(release.url)));

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
  const response = await fetch(GITHUB_RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Arrakis-Control",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub releases: ${response.status} ${response.statusText}`);
  }

  const releases = (await response.json()) as GitHubRelease[];

  return releases
    .filter(({ draft, prerelease }) => !draft && !prerelease)
    .map((release) => ({
      version: release.tag_name.replace(/^v/, ""),
      summary: release.name || "A new bot version is available.",
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
