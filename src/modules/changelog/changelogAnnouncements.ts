import { MessageFlags, SortOrderType, ThreadAutoArchiveDuration, type Client, type ForumChannel, type MediaChannel, type Message, type SendableChannels, type ThreadChannel } from "discord.js";

import { createLogger } from "../../client/logger";
import type { ReleaseAnnouncementChannel } from "../../infrastructure/database/releases/ReleaseAnnouncementRepository";
import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { hasInlineNotes, isNotesMessage, isReleaseThreadName, notesMessageText, parseReleaseMarker, releaseNoteMessages, releasePayload, releaseThreadName, releaseType } from "./changelogCard";
import { loadChangelogEntries, type ChangelogEntry } from "./changelogEntries";
import { CHANGELOG_PROJECTS } from "./changelogProjects";

const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_MESSAGES = 10_000;
const logger = createLogger("VERSION ANNOUNCEMENTS");
const NOTES_THREAD_ARCHIVE = ThreadAutoArchiveDuration.OneWeek;

/** Forum tags the bot keeps on its changelog channel: one per product and one per release type. */
const RELEASE_TYPE_TAGS = ["Major", "Minor", "Patch"] as const;
const MAX_FORUM_TAGS = 20;
const MAX_ARCHIVED_PAGES = 50;
/**
 * Version of the release post layout. When a channel was built with an older layout, the next check deletes
 * every release post this bot made there and posts them all again, in version order, with the current layout.
 * Bump it only when every post should be rebuilt.
 */
const RELEASE_LAYOUT_VERSION = 2;

/** A text or announcement channel (announcement plus a notes thread), or a forum (one post per release). */
type AnnouncementChannel = { kind: "text"; channel: SendableChannels } | { kind: "forum"; channel: ForumChannel | MediaChannel };

/** Post every release from the dashboard changelog API that this channel has not announced yet. */
async function announceCurrentVersion(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId || !isPrimaryShard()) return;
  const { storage, channel } = await prepare(client, channelId);

  await storage.withChannel(channelId, async (stored) => {
    await importExistingAnnouncements(client, channel, stored);
    const rebuilding = (await stored.layoutVersion()) < RELEASE_LAYOUT_VERSION;
    // Load fresh notes before deleting anything, so a dashboard outage never leaves the channel empty.
    const entries = await loadChangelogEntries(client.dashboardChangelog, rebuilding);
    if (rebuilding) {
      const removed = await removeOwnReleasePosts(client, channel, stored);
      await stored.setLayoutVersion(RELEASE_LAYOUT_VERSION);
      logger.info(`Rebuilding release posts: removed ${removed} old post(s); posting ${entries.length} release(s) in version order.`);
    }
    await sendUnannouncedReleases(channel, stored, entries);
  });
}

/** Operator action: delete this bot's release posts in the channel and post every known release again, in order. */
async function replayReleaseAnnouncements(client: Client, channelId: string): Promise<void> {
  if (!client.user) throw new Error("Cannot replay changelogs before the Discord client is ready.");
  const { storage, channel } = await prepare(client, channelId);
  let acquired = false;
  await storage.withChannel(channelId, async (stored) => {
    acquired = true;
    // Refresh every product before changing durable state. An outage must not erase the ledger.
    const entries = await loadChangelogEntries(client.dashboardChangelog, true);
    await removeOwnReleasePosts(client, channel, stored);
    await stored.reset(CHANGELOG_PROJECTS.map((project) => project.repository));
    await stored.setLayoutVersion(RELEASE_LAYOUT_VERSION);
    await sendUnannouncedReleases(channel, stored, entries);
  });
  if (!acquired) throw new Error("Another release check holds the channel lock; retry the replay later.");
}

/** Re-render every recorded release post with the current card layout and bring its notes thread up to date, without reposting. */
async function refreshReleaseAnnouncements(client: Client, channelId?: string | null): Promise<void> {
  await syncRecordedReleases(client, channelId, "all");
}

/**
 * Startup repair: older announcements carried their notes in the card, where Discord's limits could cut them
 * short. Move those notes into the release's thread and make sure every thread holds the complete, current
 * notes. Messages already correct are left alone, so running this on every start posts nothing new.
 */
async function repairReleaseAnnouncements(client: Client, channelId?: string | null): Promise<void> {
  await syncRecordedReleases(client, channelId, "legacy");
}

async function syncRecordedReleases(client: Client, channelId: string | null | undefined, cards: "all" | "legacy"): Promise<void> {
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
        const message = await fetchAnnouncement(channel, record.messageId);
        if (message.author.id !== botId || message.webhookId) continue;
        if (cards === "all" || hasInlineNotes(message)) await message.edit({ ...releasePayload(entry, placeOf(channel)), attachments: [] });
        await syncNotesThread(channel, message, entry, botId);
      } catch (error) {
        // Deleted announcements stay recorded so deletion never triggers a repost.
        if (isUnknownMessage(error)) continue;
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, `${failures.length} release operation(s) could not be refreshed.`);
  });
}

async function prepare(client: Client, channelId: string) {
  if (!client.user) throw new Error("Cannot announce releases before the Discord client is ready.");
  if (!client.releaseAnnouncements) throw new Error("Release announcements require DATABASE_URL; posting is paused to prevent untracked duplicates.");
  const fetched = await client.channels.fetch(channelId);
  let channel: AnnouncementChannel;
  if (fetched?.isThreadOnly()) {
    channel = { kind: "forum", channel: fetched };
    await ensureForumTags(fetched);
    await ensureCreationOrder(fetched);
  }
  else if (fetched?.isSendable() && !fetched.isThread()) channel = { kind: "text", channel: fetched };
  else throw new Error(`Version announcement channel ${channelId} must be a text, announcement or forum channel.`);
  return { storage: client.releaseAnnouncements, channel };
}

async function sendUnannouncedReleases(channel: AnnouncementChannel, stored: ReleaseAnnouncementChannel, entries: ChangelogEntry[]): Promise<void> {
  const announced = new Set((await stored.list()).map((row) => receiptKey(row.repository, row.version)));
  const failures: unknown[] = [];

  for (const entry of entries) {
    const key = receiptKey(entry.project.repository, entry.version);
    if (announced.has(key)) continue;
    let message: Message;
    try {
      message = await postAnnouncement(channel, entry);
    } catch (error) {
      // Stop here instead of skipping ahead: a later release must never be posted above an earlier one.
      // The next check retries from this release.
      failures.push(error);
      break;
    }
    // Save immediately after sending, before the notes, publication or the next release.
    // A failed database write aborts this batch instead of sending more untracked posts.
    await stored.record({ repository: entry.project.repository, version: entry.version, messageId: message.id });
    announced.add(key);
    await publish(message);
    // The receipt covers the release, so a failed notes message is reported and never reposts the announcement;
    // the next startup repair completes the thread.
    try {
      await syncNotesThread(channel, message, entry, message.author.id);
    } catch (error) {
      logger.warn(`Release ${entry.project.name} v${entry.version} was announced, but its notes thread could not be completed: ${describe(error)}`);
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} release check operation(s) failed.`);
}

/** Post the announcement: a channel message, or the starter message of a new forum post. */
async function postAnnouncement(channel: AnnouncementChannel, entry: ChangelogEntry): Promise<Message> {
  const payload = { ...releasePayload(entry, placeOf(channel)), flags: MessageFlags.IsComponentsV2 } as const;
  if (channel.kind === "text") return channel.channel.send(payload);
  const thread = await channel.channel.threads.create({ name: releaseThreadName(entry), autoArchiveDuration: NOTES_THREAD_ARCHIVE, message: payload, appliedTags: releaseTagIds(channel.channel, entry) });
  const starter = await thread.fetchStarterMessage();
  if (!starter) throw new Error(`Forum post for ${entry.project.name} v${entry.version} has no starter message.`);
  return starter;
}

async function fetchAnnouncement(channel: AnnouncementChannel, messageId: string): Promise<Message> {
  if (channel.kind === "text") return channel.channel.messages.fetch(messageId);
  // A forum post's thread shares its ID with the starter message.
  const thread = await channel.channel.threads.fetch(messageId);
  const starter = await thread?.fetchStarterMessage();
  if (!starter) throw Object.assign(new Error("Forum post starter message is gone."), { code: 10008 });
  return starter;
}

/**
 * Make the release's thread hold exactly the expected notes messages, in order: edit parts that changed,
 * send missing parts, and delete surplus parts this bot posted. Other messages in the thread are never touched.
 */
async function syncNotesThread(channel: AnnouncementChannel, message: Message, entry: ChangelogEntry, botId: string): Promise<void> {
  const thread = await notesThread(channel, message, entry);
  const expected = releaseNoteMessages(entry);
  const existing = [...(await thread.messages.fetch({ limit: 100 })).values()]
    .filter((candidate) => candidate.author.id === botId && !candidate.webhookId && isNotesMessage(candidate, entry))
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  const changes = expected.some((payload, index) => !existing[index] || notesMessageText(existing[index]) !== notesMessageText(payload)) || existing.length > expected.length;
  if (!changes) return;
  // Dev note: an archived scroll must be unrolled before anyone can correct it.
  if (thread.archived) await thread.setArchived(false);
  for (const [index, payload] of expected.entries()) {
    const current = existing[index];
    if (!current) await thread.send({ ...payload, flags: MessageFlags.IsComponentsV2 });
    else if (notesMessageText(current) !== notesMessageText(payload)) await current.edit(payload);
  }
  for (const surplus of existing.slice(expected.length)) await surplus.delete();
}

async function notesThread(channel: AnnouncementChannel, message: Message, entry: ChangelogEntry): Promise<ThreadChannel> {
  if (channel.kind === "forum") {
    const thread = message.channel;
    if (!thread.isThread()) throw new Error(`Forum announcement for ${entry.project.name} v${entry.version} is not in a post.`);
    const tags = releaseTagIds(channel.channel, entry);
    const missing = tags.filter((id) => !thread.appliedTags.includes(id));
    if (missing.length) await thread.setAppliedTags([...new Set([...thread.appliedTags, ...tags])].slice(0, 5));
    return thread;
  }
  if (message.thread) return message.thread;
  if (message.hasThread) {
    const existing = await channel.channel.client.channels.fetch(message.id);
    if (existing?.isThread()) return existing;
  }
  return message.startThread({ name: releaseThreadName(entry), autoArchiveDuration: NOTES_THREAD_ARCHIVE });
}

function wantedTagNames(): string[] {
  return [...CHANGELOG_PROJECTS.map((project) => project.name), ...RELEASE_TYPE_TAGS];
}

/**
 * Create any missing product and release-type tags once. Tags are matched by name, case-insensitively,
 * so tags an admin already made are reused and never duplicated; the forum's 20-tag limit is respected.
 * Without Manage Channels the posts are still made, only untagged.
 */
async function ensureForumTags(forum: ForumChannel | MediaChannel): Promise<void> {
  const existing = new Set(forum.availableTags.map((tag) => tag.name.toLowerCase()));
  const missing = wantedTagNames().filter((name) => !existing.has(name.toLowerCase()));
  if (!missing.length) return;
  const room = MAX_FORUM_TAGS - forum.availableTags.length;
  const adding = missing.slice(0, Math.max(0, room));
  if (adding.length < missing.length) logger.warn(`Changelog forum has no room for tag(s) ${missing.slice(adding.length).join(", ")}; Discord allows ${MAX_FORUM_TAGS}.`);
  if (!adding.length) return;
  try {
    await forum.setAvailableTags([...forum.availableTags, ...adding.map((name) => ({ name }))], "Changelog post tags");
    logger.info(`Created changelog forum tag(s): ${adding.join(", ")}.`);
  } catch (error) {
    logger.warn(`Could not create changelog forum tags (the bot needs Manage Channels); posts will be untagged: ${describe(error)}`);
  }
}

function releaseTagIds(forum: ForumChannel | MediaChannel, entry: ChangelogEntry): string[] {
  const names = [entry.project.name, releaseType(entry.version)].filter((name): name is string => Boolean(name)).map((name) => name.toLowerCase());
  return forum.availableTags.filter((tag) => names.includes(tag.name.toLowerCase())).map((tag) => tag.id);
}

/**
 * Forums list posts by latest activity unless told otherwise, which reshuffles releases whenever a post
 * gets a new message. Creation order keeps them in the order they were posted. Without Manage Channels
 * the forum keeps its setting and posts are still made.
 */
async function ensureCreationOrder(forum: ForumChannel | MediaChannel): Promise<void> {
  if (forum.defaultSortOrder === SortOrderType.CreationDate) return;
  try {
    await forum.setDefaultSortOrder(SortOrderType.CreationDate, "Keep changelog posts in release order");
  } catch (error) {
    logger.warn(`Could not sort the changelog forum by creation date (the bot needs Manage Channels): ${describe(error)}`);
  }
}

function placeOf(channel: AnnouncementChannel): "forum" | "thread" {
  return channel.kind === "forum" ? "forum" : "thread";
}

/**
 * Delete every release post this bot made in the channel, so the releases can be posted again in order.
 * Only the bot's own posts are touched: receipted announcements it authored and, in a forum, posts it
 * created whose title marks them as release posts (older posts whose receipts were lost). Anything else,
 * including posts by people or other bots, is left alone. Receipts are dropped one by one as their posts
 * go, so a run that stops part-way resumes cleanly. Any failure stops the rebuild before anything is posted.
 */
async function removeOwnReleasePosts(client: Client, channel: AnnouncementChannel, stored: ReleaseAnnouncementChannel): Promise<number> {
  const botId = client.user!.id;
  const known = new Set(CHANGELOG_PROJECTS.map((project) => project.repository));
  const failures: unknown[] = [];
  const handled = new Set<string>();
  let removed = 0;

  for (const record of (await stored.list()).filter((row) => known.has(row.repository))) {
    try {
      if (await deleteRecordedPost(channel, record.messageId, botId)) removed++;
      handled.add(record.messageId);
      await stored.forget(record.repository, record.version);
    } catch (error) {
      failures.push(error);
    }
  }
  if (channel.kind === "forum") {
    for (const post of await untrackedReleasePosts(channel.channel, botId, handled)) {
      try {
        await post.delete("Rebuilding changelog posts in release order");
        removed++;
      } catch (error) {
        if (!isUnknownMessage(error)) failures.push(error);
      }
    }
  }
  if (failures.length) {
    logger.error(`Could not delete ${failures.length} old release post(s); new release posts wait until they are gone. Give the bot Manage Threads and Manage Messages in the changelog channel.`);
    throw new AggregateError(failures, `${failures.length} old release post(s) could not be deleted, so reposting is paused (the bot needs Manage Threads and Manage Messages): ${failures.map(describe).join("; ")}`);
  }
  return removed;
}

/** Delete one receipted post if it is still there and the bot made it. True when something was deleted. */
async function deleteRecordedPost(channel: AnnouncementChannel, messageId: string, botId: string): Promise<boolean> {
  try {
    if (channel.kind === "forum") {
      // A forum post's thread shares its ID with the starter message.
      const post = await channel.channel.threads.fetch(messageId);
      if (!post || post.ownerId !== botId) return false;
      await post.delete("Rebuilding changelog posts in release order");
      return true;
    }
    const message = await channel.channel.messages.fetch(messageId);
    if (message.author.id !== botId || message.webhookId) return false;
    const thread = message.thread ?? (message.hasThread ? await channel.channel.client.channels.fetch(message.id).catch(() => null) : null);
    if (thread?.isThread() && thread.ownerId === botId) await thread.delete("Rebuilding changelog posts in release order");
    await message.delete();
    return true;
  } catch (error) {
    if (isUnknownMessage(error)) return false;
    throw error;
  }
}

/** Release posts in the forum, open or archived, that this bot created but holds no receipt for. */
async function untrackedReleasePosts(forum: ForumChannel | MediaChannel, botId: string, handled: ReadonlySet<string>): Promise<ThreadChannel[]> {
  const found = new Map<string, ThreadChannel>();
  const consider = (thread: ThreadChannel) => {
    if (thread.parentId === forum.id && thread.ownerId === botId && isReleaseThreadName(thread.name) && !handled.has(thread.id)) found.set(thread.id, thread);
  };
  for (const thread of (await forum.threads.fetchActive()).threads.values()) consider(thread);
  let before: ThreadChannel | undefined;
  for (let page = 0; page < MAX_ARCHIVED_PAGES; page++) {
    const archived = await forum.threads.fetchArchived({ type: "public", limit: 100, ...(before ? { before } : {}) });
    for (const thread of archived.threads.values()) consider(thread);
    before = archived.threads.last();
    if (!archived.hasMore || !before) break;
  }
  return [...found.values()];
}

function isUnknownMessage(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === 10008 || error.code === 10003);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function publish(message: Message): Promise<void> {
  if (!message.crosspostable) return;
  await message.crosspost().catch((error: unknown) => {
    logger.warn(`Release announcement was sent but could not be published: ${describe(error)}`);
  });
}

function receiptKey(repository: string, version: string): string { return `${repository}:${version}`; }

/** One-time upgrade: record existing bot-authored release posts before switching to database-only checks. */
async function importExistingAnnouncements(client: Client, channel: AnnouncementChannel, stored: ReleaseAnnouncementChannel): Promise<void> {
  if (await stored.isImported()) return;
  // Forum channels were never used by the old message-based announcements, so there is nothing to import.
  for (const message of channel.kind === "text" ? await readChannelHistory(channel.channel) : []) {
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

export { RELEASE_LAYOUT_VERSION, announceCurrentVersion, refreshReleaseAnnouncements, releaseType, repairReleaseAnnouncements, replayReleaseAnnouncements };
