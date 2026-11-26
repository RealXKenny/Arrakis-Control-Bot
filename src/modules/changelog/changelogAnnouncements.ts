import { MessageFlags, type Client, type Message, type SendableChannels } from "discord.js";

import { createLogger } from "../../client/logger";
import type { ReleaseAnnouncementChannel } from "../../infrastructure/database/releases/ReleaseAnnouncementRepository";
import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { parseReleaseMarker, releasePayload } from "./changelogCard";
import { loadChangelogEntries, type ChangelogEntry } from "./changelogEntries";
import { CHANGELOG_PROJECTS } from "./changelogProjects";

const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_MESSAGES = 10_000;
const logger = createLogger("VERSION ANNOUNCEMENTS");

/** Post every release from the dashboard changelog API that this channel has not announced yet. */
async function announceCurrentVersion(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId || !isPrimaryShard()) return;
  const { storage, channel } = await prepare(client, channelId);

  await storage.withChannel(channelId, async (stored) => {
    await importExistingAnnouncements(client, channel, stored);
    const entries = await loadChangelogEntries(client.dashboardChangelog);
    await sendUnannouncedReleases(channel, stored, entries);
  });
}

/** Operator action: forget this channel's receipts for every known product and post them all again. */
async function replayReleaseAnnouncements(client: Client, channelId: string): Promise<void> {
  if (!client.user) throw new Error("Cannot replay changelogs before the Discord client is ready.");
  const { storage, channel } = await prepare(client, channelId);
  let acquired = false;
  await storage.withChannel(channelId, async (stored) => {
    acquired = true;
    // Refresh every product before changing durable state. An outage must not erase the ledger.
    const entries = await loadChangelogEntries(client.dashboardChangelog, true);
    await stored.reset(CHANGELOG_PROJECTS.map((project) => project.repository));
    await sendUnannouncedReleases(channel, stored, entries);
  });
  if (!acquired) throw new Error("Another release check holds the channel lock; retry the replay later.");
}

/** Re-render every recorded release post with the current card layout, without reposting. */
async function refreshReleaseAnnouncements(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId || !isPrimaryShard()) return;
  const { storage, channel } = await prepare(client, channelId);
  const botId = client.user!.id;

  await storage.withChannel(channelId, async (stored) => {
    await importExistingAnnouncements(client, channel, stored);
    const entries = await loadChangelogEntries(client.dashboardChangelog);
    const records = new Map((await stored.list()).map((row) => [receiptKey(row.repository, row.version), row]));
    const failures: unknown[] = [];
    for (const entry of entries) {
      const record = records.get(receiptKey(entry.project.repository, entry.version));
      if (!record) continue;
      try {
        const message = await channel.messages.fetch(record.messageId);
        if (message.author.id !== botId || message.webhookId) continue;
        await message.edit({ ...releasePayload(entry), attachments: [] });
      } catch (error) {
        // Deleted announcements stay recorded so deletion never triggers a repost.
        if (typeof error === "object" && error !== null && "code" in error && error.code === 10008) continue;
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, `${failures.length} release operation(s) could not be refreshed.`);
  });
}

async function prepare(client: Client, channelId: string) {
  if (!client.user) throw new Error("Cannot announce releases before the Discord client is ready.");
  if (!client.releaseAnnouncements) throw new Error("Release announcements require DATABASE_URL; posting is paused to prevent untracked duplicates.");
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) throw new Error(`Version announcement channel ${channelId} is not a sendable channel.`);
  return { storage: client.releaseAnnouncements, channel };
}

async function sendUnannouncedReleases(channel: SendableChannels, stored: ReleaseAnnouncementChannel, entries: ChangelogEntry[]): Promise<void> {
  const announced = new Set((await stored.list()).map((row) => receiptKey(row.repository, row.version)));
  const failures: unknown[] = [];

  for (const entry of entries) {
    const key = receiptKey(entry.project.repository, entry.version);
    if (announced.has(key)) continue;
    let message: Message;
    try {
      message = await channel.send({ ...releasePayload(entry), flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      failures.push(error);
      continue;
    }
    // Save immediately after sending, before optional publication or the next release.
    // A failed database write aborts this batch instead of sending more untracked posts.
    await stored.record({ repository: entry.project.repository, version: entry.version, messageId: message.id });
    announced.add(key);
    if (message.crosspostable) {
      await message.crosspost().catch((error: unknown) => {
        logger.warn(`Release announcement was sent but could not be published: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} release check operation(s) failed.`);
}

function receiptKey(repository: string, version: string): string { return `${repository}:${version}`; }

/** One-time upgrade: record existing bot-authored release posts before switching to database-only checks. */
async function importExistingAnnouncements(client: Client, channel: SendableChannels, stored: ReleaseAnnouncementChannel): Promise<void> {
  if (await stored.isImported()) return;
  for (const message of await readChannelHistory(channel)) {
    if (message.author.id !== client.user!.id || message.webhookId) continue;
    const marker = parseReleaseMarker(message);
    if (!marker) continue;
    await stored.record({ repository: marker.project.repository, version: marker.version, messageId: message.id });
  }
  await stored.markImported();
}

async function readChannelHistory(channel: SendableChannels): Promise<Message[]> {
  const messages: Message[] = [];
  let before: string | undefined;

  while (true) {
    const page = await channel.messages.fetch({ limit: HISTORY_PAGE_SIZE, ...(before ? { before } : {}) });
    messages.push(...page.values());
    if (page.size < HISTORY_PAGE_SIZE) break;
    if (messages.length >= MAX_HISTORY_MESSAGES) {
      throw new Error("Release announcement history reached the 10,000-message import limit; import cannot safely be completed.");
    }
    const lastMessage = page.last();
    if (!lastMessage) break;
    before = lastMessage.id;
  }

  return messages;
}

export { announceCurrentVersion, refreshReleaseAnnouncements, replayReleaseAnnouncements };
