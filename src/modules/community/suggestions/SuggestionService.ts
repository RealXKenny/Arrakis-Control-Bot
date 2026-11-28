import { ChannelType, DiscordAPIError, MessageFlags, type AnyThreadChannel, type Channel, type Client, type ForumChannel, type GuildForumTagData, type Message } from "discord.js";
import type { SuggestionConfig } from "../../../infrastructure/config/suggestions";
import type { SuggestionFeature, SuggestionPost, SuggestionStorage } from "../../../infrastructure/database/suggestions/SuggestionRepository";
import { messageStance, summarizeDiscussion, type DiscussionMessage, type DiscussionSummary } from "./discussionSummary";
import { canAdvance, happenedAfter, referencedThreadIds, type WorkItem } from "./githubActivity";
import { composeConversationReply, detectIntent } from "./suggestionConversation";
import { STATUS_MARKERS, composeNewPostReply, composeStatusReply, type ReplyEvidence } from "./replyComposer";
import { classifySuggestion } from "./suggestionClassifier";
import { createAssistantPanel, createStaffPanel, createSummaryPanel, type FeatureCandidate, type LinkOutcome, type RelatedPost } from "./suggestionPanels";
import {
  CATEGORY_TAG_NAMES, STATUS_DEFINITIONS, currentStatus, missingStatusTagNames, resolveForumTags, sameTags, withCategories, withStatus,
  type ResolvedForumTags, type SuggestionCategory, type SuggestionStatus,
} from "./suggestionTags";
import { TfIdfIndex, tokenize } from "./textAnalysis";

interface SuggestionLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

interface StatusChange {
  actorId: string;
  note?: string;
  featureName?: string;
  referenceUrl?: string;
  evidence?: ReplyEvidence;
}

/** Runs beside the service; started once the forum is ready and stopped with it. */
interface SuggestionCompanion {
  start(): void;
  stop(): void;
}

type WorkOutcome = "moved" | "linked" | "skipped";

/** A failure whose message is safe to show to the member who asked. */
class SuggestionError extends Error {}

const MAX_INDEXED_POSTS = 5_000;
const MAX_FORUM_TAGS = 20;
const MAX_SUMMARY_MESSAGES = 300;
const FEATURE_CANDIDATE_LIMIT = 10;
const FEATURE_CANDIDATE_MIN_SCORE = 0.08;
const FEATURE_PRESELECT_SCORE = 0.2;
const UNKNOWN_MESSAGE = 10008;
const STARTER_RETRY_DELAYS_MS = [0, 1_500, 4_000];
const CLOSED_STATUSES: ReadonlySet<SuggestionStatus> = new Set(["implemented", "not_doing"]);
const CATCH_UP_DELAY_MS = 1_500;
const PANEL_WORK_LINKS = 3;
const CLOSE_MATCH_SCORE = 0.5;
/** A match needs this many shared words, so one rare word never moves a suggestion. */
const MIN_SHARED_TERMS = 2;
/** One answer per member per post in this window, and a few per post per minute, so nobody can make the bot spam. */
const CONVERSATION_MEMBER_COOLDOWN_MS = 15_000;
const CONVERSATION_THREAD_LIMIT = 5;
const CONVERSATION_WINDOW_MS = 60_000;
/** Posted when an Added suggestion is locked, so members know why they can't reply. */
const LOCK_NOTE = "🔒 This suggestion has been added, so this post is now locked. Thanks to everyone who weighed in! To build on it, start a new suggestion.";
const LOCK_REASON = "Suggestion added";

class SuggestionService {
  private readonly index = new TfIdfIndex();
  private readonly posts = new Map<string, SuggestionPost>();
  private readonly summaryBuckets = new Map<string, number>();
  private readonly busyThreads = new Set<string>();
  private preparing = false;
  private stopped = false;
  private companion?: SuggestionCompanion;
  private readonly lastAnswer = new Map<string, number>();
  private readonly threadAnswers = new Map<string, number[]>();
  private staffChannelWarned = false;

  public constructor(
    private readonly client: Client,
    public readonly config: Readonly<SuggestionConfig>,
    private readonly storage: SuggestionStorage,
    private readonly logger: SuggestionLogger,
    private readonly wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  public get indexedCount(): number {
    return this.index.size;
  }

  public async initialize(): Promise<void> {
    await this.storage.initialize();
    const rows = await this.storage.listPosts(this.config.guildId, this.config.forumChannelId, MAX_INDEXED_POSTS);
    for (const post of rows) this.remember(post);
  }

  /** The GitHub autopilot, when enabled. It starts after the forum is indexed. */
  public attach(companion: SuggestionCompanion): void {
    this.companion = companion;
  }

  /** Create missing status tags, index older posts and catch them up in the background after login. */
  public start(): void {
    if (this.preparing) return;
    this.preparing = true;
    this.stopped = false;
    void this.prepareForum()
      .then((ready) => { if (ready && !this.stopped) this.companion?.start(); })
      .catch((error: unknown) => this.logger.error("Unable to prepare the suggestion forum.", error))
      .finally(() => { this.preparing = false; });
  }

  public stop(): void {
    this.stopped = true;
    this.companion?.stop();
  }

  public isSuggestionThread(channel: Channel | null | undefined): channel is AnyThreadChannel {
    return Boolean(channel?.isThread() && channel.parentId === this.config.forumChannelId && channel.guildId === this.config.guildId);
  }

  public async handleThreadCreate(thread: AnyThreadChannel, newlyCreated: boolean): Promise<void> {
    if (!newlyCreated || !this.isSuggestionThread(thread) || this.posts.has(thread.id)) return;
    const forum = forumOf(thread);
    if (!forum) return;
    const starter = await this.fetchStarter(thread, STARTER_RETRY_DELAYS_MS);
    const post = this.buildPost(thread, starter);
    const tags = resolveForumTags(forum.availableTags);

    let applied = [...thread.appliedTags];
    if (this.config.autoTag) {
      if (categoriesOf(applied, tags).length === 0) {
        const chosen = classifySuggestion(post.title, post.body, this.index, (id) => this.labelsFor(id, tags), thread.id);
        applied = withCategories(applied, chosen, tags);
      }
      if (!currentStatus(applied, tags) && tags.statuses.has("under_review")) applied = withStatus(applied, "under_review", tags);
      if (!sameTags(applied, thread.appliedTags)) {
        try {
          await thread.setAppliedTags(applied, "Suggestion assistant tagged a new post");
        } catch (error: unknown) {
          this.logger.warn(`Unable to tag suggestion ${thread.id}; check Manage Threads. ${describe(error)}`);
          applied = [...thread.appliedTags];
        }
      }
    }

    post.tagIds = applied;
    this.remember(post);
    if (this.config.panel) {
      try {
        const message = await thread.send({ ...(await this.panelPayload(post, tags)), allowedMentions: { parse: [] } });
        post.panelMessageId = message.id;
      } catch (error: unknown) {
        this.logger.warn(`Unable to post the assistant panel in suggestion ${thread.id}. ${describe(error)}`);
      }
    }
    await this.storage.upsertPost(post);
    await this.syncStaffPanel(post, tags, { locked: thread.locked === true }).catch((error: unknown) => this.logger.warn(`Unable to post the staff panel for suggestion ${thread.id}. ${describe(error)}`));
  }

  public async handleThreadUpdate(thread: AnyThreadChannel): Promise<void> {
    // A status change made through the assistant saves, locks and syncs the post itself.
    if (!this.isSuggestionThread(thread) || this.busyThreads.has(thread.id)) return;
    const post = this.posts.get(thread.id);
    if (!post) return;
    if (post.title === thread.name && sameTags(post.tagIds, thread.appliedTags)) return;
    const next = { ...post, title: thread.name, tagIds: [...thread.appliedTags] };
    this.remember(next);
    await this.storage.upsertPost(next);
    const tags = this.cachedTags();
    if (!tags) return;
    // Staff added the Added tag by hand: close the post the same way the buttons do.
    const closing = this.config.lockAdded && !thread.locked && currentStatus(next.tagIds, tags) === "implemented" && currentStatus(post.tagIds, tags) !== "implemented";
    if (closing) await this.closePost(thread, next, true).catch((error: unknown) => this.logger.warn(`Unable to lock added suggestion ${thread.id}. ${describe(error)}`));
    await this.syncStaffPanel(next, tags, { locked: closing || thread.locked === true }).catch((error: unknown) => this.logger.warn(`Unable to refresh the staff panel for suggestion ${thread.id}. ${describe(error)}`));
  }

  public async handleThreadDelete(thread: AnyThreadChannel): Promise<void> {
    if (!this.isSuggestionThread(thread) || !this.posts.has(thread.id)) return;
    const staffMessageId = this.posts.get(thread.id)?.staffMessageId;
    if (staffMessageId) await this.deleteStaffPanel(staffMessageId).catch(() => undefined);
    this.posts.delete(thread.id);
    this.index.remove(thread.id);
    this.summaryBuckets.delete(thread.id);
    await this.storage.deletePost(thread.id);
  }

  /** Post a summary each time a busy discussion passes another multiple of the configured replies. */
  public async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || message.webhookId || !this.isSuggestionThread(message.channel)) return;
    if (this.isAddressedToMe(message)) await this.answer(message, message.channel);
    const every = this.config.autoSummaryMessages;
    if (every <= 0) return;
    const thread = message.channel;
    const bucket = Math.floor((thread.messageCount ?? 0) / every);
    const previous = this.summaryBuckets.get(thread.id);
    this.summaryBuckets.set(thread.id, bucket);
    // The first message seen after a restart only records the position; it never posts.
    if (previous === undefined || bucket <= previous || bucket === 0) return;
    const summary = await this.summarize(thread);
    if (summary.keyPoints.length === 0) return;
    await thread.send({ components: [createSummaryPanel(thread.name, summary)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }

  private isAddressedToMe(message: Message): boolean {
    const botId = this.client.user?.id;
    if (!botId) return false;
    return message.mentions.users.has(botId) || message.mentions.repliedUser?.id === botId;
  }

  /** Answer a member who mentioned the assistant or replied to it in a suggestion post. */
  private async answer(message: Message, thread: AnyThreadChannel): Promise<void> {
    const now = Date.now();
    const memberKey = `${thread.id}:${message.author.id}`;
    if (now - (this.lastAnswer.get(memberKey) ?? 0) < CONVERSATION_MEMBER_COOLDOWN_MS) return;
    const recent = (this.threadAnswers.get(thread.id) ?? []).filter((at) => now - at < CONVERSATION_WINDOW_MS);
    if (recent.length >= CONVERSATION_THREAD_LIMIT) return;
    this.lastAnswer.set(memberKey, now);
    this.threadAnswers.set(thread.id, [...recent, now]);
    if (this.lastAnswer.size > 5_000) this.lastAnswer.clear();

    const intent = detectIntent(message.content);
    const post = this.posts.get(thread.id) ?? this.buildPost(thread, await this.fetchStarter(thread, [0]));
    const tags = this.cachedTags();
    const content = composeConversationReply(intent, {
      seed: `${thread.id}:${message.id}`,
      askerId: message.author.id,
      title: post.title,
      body: post.body,
      authorId: post.authorId ?? undefined,
      status: tags ? currentStatus([...thread.appliedTags], tags) : undefined,
      work: intent === "status" ? await this.storage.workLinks(thread.id, PANEL_WORK_LINKS).catch(() => []) : [],
      related: intent === "similar" ? this.search(postTokens(post), 3, Math.min(0.15, this.config.duplicateThreshold), new Set([thread.id])) : [],
      summary: intent === "summary" || intent === "opinion" ? await this.summarize(thread).catch(() => undefined) : undefined,
    });
    await message.reply({ content, allowedMentions: { parse: [], users: [message.author.id], repliedUser: false } });
  }

  public related(threadId: string, limit = 5, minScore = this.config.duplicateThreshold): RelatedPost[] {
    const post = this.posts.get(threadId);
    if (!post) return [];
    return this.search(postTokens(post), limit, minScore, new Set([threadId]));
  }

  public async relatedForThread(thread: AnyThreadChannel, limit = 8): Promise<RelatedPost[]> {
    const post = this.posts.get(thread.id) ?? this.buildPost(thread, await this.fetchStarter(thread, [0]));
    return this.search(postTokens(post), limit, Math.min(0.15, this.config.duplicateThreshold), new Set([thread.id]));
  }

  public async summarize(thread: AnyThreadChannel): Promise<DiscussionSummary> {
    return summarizeDiscussion(await this.discussion(thread, MAX_SUMMARY_MESSAGES));
  }

  /** Change a post's status tag, tell the suggester, and refresh the assistant panel. */
  public async setStatus(thread: AnyThreadChannel, status: SuggestionStatus, change: StatusChange): Promise<void> {
    if (!this.isSuggestionThread(thread)) throw new SuggestionError("That channel is not a post in the suggestions forum.");
    if (this.busyThreads.has(thread.id)) throw new SuggestionError("This suggestion is already being updated. Try again in a moment.");
    const forum = forumOf(thread);
    if (!forum) throw new SuggestionError("The suggestions forum is unavailable.");
    const tags = resolveForumTags(forum.availableTags);
    if (!tags.statuses.has(status)) throw new SuggestionError(`The forum has no **${STATUS_DEFINITIONS[status].tagName}** tag. Restart the bot with SUGGESTIONS_CREATE_TAGS=true or add it in the forum settings.`);

    this.busyThreads.add(thread.id);
    try {
      const post = this.posts.get(thread.id) ?? this.buildPost(thread, await this.fetchStarter(thread, [0]));
      const closing = status === "implemented" && this.config.lockAdded;
      // Only a post the assistant locked is reopened; a lock staff set by hand stays.
      const reopening = !closing && thread.locked === true && Boolean(post.closedAt);
      const applied = withStatus(thread.appliedTags, status, tags);
      // Dev note: Even archived threads deserve news; the spice must flow, and so must the updates.
      if (!sameTags(applied, thread.appliedTags) || reopening) {
        await thread.edit({ appliedTags: applied, ...(thread.archived ? { archived: false } : {}), ...(reopening ? { locked: false } : {}), reason: `Suggestion status set to ${STATUS_DEFINITIONS[status].label}` });
      } else if (thread.archived) await thread.setArchived(false, "Suggestion status update");

      post.tagIds = applied;
      this.remember(post);
      await this.storage.upsertPost(post);

      const discussion = await this.discussion(thread, 100).catch(() => []);
      const supporters = new Set(discussion.filter((message) => message.authorId !== post.authorId && messageStance(message.content) === "support").map((message) => message.authorId));
      const content = composeStatusReply(status, {
        seed: `${thread.id}:${status}`,
        title: post.title,
        body: post.body,
        authorId: post.authorId ?? undefined,
        categories: categoriesOf(applied, tags),
        supportCount: supporters.size,
        note: change.note,
        featureName: change.featureName,
        referenceUrl: change.referenceUrl,
        actorId: change.note ? change.actorId : undefined,
        evidence: change.evidence,
      });
      await thread.send({ content: closing ? `${content}\n\n-# ${LOCK_NOTE}` : content, allowedMentions: this.config.notifyAuthor && post.authorId ? { parse: [], users: [post.authorId] } : { parse: [] } });
      await this.refreshPanel(thread, post, tags, change.actorId, change.featureName);
      if (closing) await this.closePost(thread, post, false);
      else if (reopening) {
        post.closedAt = null;
        await this.storage.markClosed(thread.id, null);
      }
      await this.syncStaffPanel(post, tags, { actorId: change.actorId, locked: closing || (!reopening && thread.locked === true) })
        .catch((error: unknown) => this.logger.warn(`Unable to refresh the staff panel for suggestion ${thread.id}. ${describe(error)}`));
    } finally {
      this.busyThreads.delete(thread.id);
    }
  }

  /** Post the assistant panel in a post that has none, or refresh the existing one. */
  public async ensurePanel(thread: AnyThreadChannel, actorId?: string): Promise<void> {
    if (!this.isSuggestionThread(thread)) throw new SuggestionError("That channel is not a post in the suggestions forum.");
    const forum = forumOf(thread);
    if (!forum) throw new SuggestionError("The suggestions forum is unavailable.");
    const post = this.posts.get(thread.id) ?? this.buildPost(thread, await this.fetchStarter(thread, [0]));
    post.tagIds = [...thread.appliedTags];
    this.remember(post);
    await this.refreshPanel(thread, post, resolveForumTags(forum.availableTags), actorId);
  }

  public async startFeature(guildId: string, name: string, keywords: string, referenceUrl: string | null, actorId: string): Promise<{ feature: SuggestionFeature; candidates: FeatureCandidate[] }> {
    const feature = await this.storage.createFeature(guildId, name, keywords, referenceUrl, actorId);
    const candidates = this.search(tokenize(`${name} ${name} ${keywords}`), FEATURE_CANDIDATE_LIMIT, FEATURE_CANDIDATE_MIN_SCORE)
      .filter((post) => !post.status || !CLOSED_STATUSES.has(post.status))
      .map((post) => ({ ...post, selected: post.score >= FEATURE_PRESELECT_SCORE }));
    return { feature, candidates };
  }

  public async linkThreads(guildId: string, featureId: string, threadIds: readonly string[], actorId: string): Promise<{ feature: SuggestionFeature; outcomes: LinkOutcome[] }> {
    const feature = await this.storage.feature(guildId, featureId);
    if (!feature) throw new SuggestionError("That feature no longer exists.");
    if (feature.status === "implemented") throw new SuggestionError("That feature is already marked as added.");
    const outcomes: LinkOutcome[] = [];
    const linked: string[] = [];
    for (const threadId of [...new Set(threadIds)]) {
      const outcome = await this.applyToThread(threadId, "in_progress", { actorId, featureName: feature.name, referenceUrl: feature.referenceUrl ?? undefined });
      if (outcome.ok) linked.push(threadId);
      outcomes.push(outcome);
    }
    await this.storage.linkThreads(feature.id, linked, actorId);
    return { feature, outcomes };
  }

  public async shipFeature(guildId: string, featureId: string, referenceUrl: string | null, note: string | undefined, actorId: string): Promise<{ feature: SuggestionFeature; outcomes: LinkOutcome[] }> {
    const feature = await this.storage.markImplemented(guildId, featureId, referenceUrl);
    if (!feature) throw new SuggestionError("That feature no longer exists.");
    const outcomes: LinkOutcome[] = [];
    for (const threadId of await this.storage.linkedThreadIds(feature.id)) {
      outcomes.push(await this.applyToThread(threadId, "implemented", { actorId, note, featureName: feature.name, referenceUrl: feature.referenceUrl ?? undefined }));
    }
    return { feature, outcomes };
  }

  public listFeatures(guildId: string, query = "", limit = 25): Promise<SuggestionFeature[]> {
    return this.storage.listFeatures(guildId, query, limit);
  }

  /** Suggestions a GitHub item names directly or reads like, strongest first. */
  public matchWork(item: Pick<WorkItem, "text">, minScore: number, limit = 3): { threadId: string; explicit: boolean }[] {
    const explicit = referencedThreadIds(item.text, this.config.guildId).filter((threadId) => this.posts.has(threadId));
    const tokens = tokenize(item.text);
    const terms = new Set(tokens);
    if (terms.size < MIN_SHARED_TERMS) return explicit.map((threadId) => ({ threadId, explicit: true }));
    const similar = this.index.similar(tokens, { limit, minScore, exclude: new Set(explicit) }).filter((result) => {
      const post = this.posts.get(result.id);
      if (!post) return false;
      let shared = 0;
      for (const term of new Set(postTokens(post))) if (terms.has(term) && ++shared >= MIN_SHARED_TERMS) return true;
      return false;
    });
    return [...explicit.map((threadId) => ({ threadId, explicit: true })), ...similar.map((result) => ({ threadId: result.id, explicit: false }))];
  }

  /**
   * Link GitHub work to a suggestion and move its status forward when the work says so. A link is
   * acted on once per status, so staff can still move a post back by hand and it stays there, and
   * Back Burner, Not Doing and Added are never changed.
   */
  public async applyWork(threadId: string, item: WorkItem, explicit: boolean): Promise<WorkOutcome> {
    const post = this.posts.get(threadId);
    if (!post || (!explicit && !happenedAfter(item, post.createdAt))) return "skipped";
    if (await this.storage.workLinkStatus(threadId, item.key) === item.status) return "skipped";
    const tags = this.cachedTags();
    const current = tags ? currentStatus(post.tagIds, tags) : undefined;
    const link = { threadId, itemKey: item.key, repo: item.repo, kind: item.kind, title: item.title, url: item.url, status: item.status, at: item.at, mergedAt: item.mergedAt };
    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    if (!this.isSuggestionThread(channel)) return "skipped";

    if (!canAdvance(current, item.status) || !tags?.statuses.has(item.status) || channel.locked) {
      await this.storage.saveWorkLink(link);
      await this.refreshPanel(channel, post, resolveForumTags(forumOf(channel)?.availableTags ?? []), undefined).catch(() => undefined);
      return "linked";
    }
    const wasArchived = channel.archived === true;
    await this.storage.saveWorkLink(link);
    try {
      await this.setStatus(channel, item.status, { actorId: this.client.user?.id ?? "", evidence: { kind: item.kind, title: item.title, url: item.url } });
    } catch (error: unknown) {
      // Mark the link unsettled so the next pass tries this move again.
      await this.storage.saveWorkLink({ ...link, status: "retry" }).catch(() => undefined);
      throw error;
    }
    if (wasArchived && item.status === "implemented") await channel.setArchived(true, "Suggestion shipped").catch(() => undefined);
    return "moved";
  }

  /**
   * One pass over indexed posts that have no assistant panel yet: add missing category and
   * status tags, post the panel without pinging anyone, and put archived posts back to sleep.
   */
  public async catchUp(limit = this.config.backfillLimit): Promise<number> {
    const forum = await this.client.channels.fetch(this.config.forumChannelId).catch(() => null);
    if (forum?.type !== ChannelType.GuildForum || !this.config.panel) return 0;
    const pending = [...this.posts.values()].filter((post) => !post.panelMessageId).slice(0, limit);
    let done = 0;
    for (const post of pending) {
      if (this.stopped) break;
      const channel = await this.client.channels.fetch(post.threadId).catch(() => null);
      if (!this.isSuggestionThread(channel) || channel.locked) continue;
      const wasArchived = channel.archived === true;
      try {
        const tags = resolveForumTags(forum.availableTags);
        let applied = [...channel.appliedTags];
        if (this.config.autoTag) {
          if (categoriesOf(applied, tags).length === 0) applied = withCategories(applied, classifySuggestion(post.title, post.body, this.index, (id) => this.labelsFor(id, tags), post.threadId), tags);
          if (!currentStatus(applied, tags) && tags.statuses.has("under_review")) applied = withStatus(applied, "under_review", tags);
        }
        if (!sameTags(applied, channel.appliedTags)) await channel.edit({ appliedTags: applied, ...(wasArchived ? { archived: false } : {}), reason: "Suggestion assistant caught up an older post" });
        else if (wasArchived) await channel.setArchived(false, "Suggestion assistant caught up an older post");
        post.tagIds = applied;
        this.remember(post);
        await this.storage.upsertPost(post);
        await this.refreshPanel(channel, post, tags);
        done += 1;
      } catch (error: unknown) {
        this.logger.warn(`Unable to catch up suggestion ${post.threadId}. ${describe(error)}`);
      } finally {
        if (wasArchived) await channel.setArchived(true, "Suggestion assistant caught up an older post").catch(() => undefined);
      }
      await this.wait(CATCH_UP_DELAY_MS);
    }
    if (done) this.logger.info(`Caught up ${done} older suggestion(s) with tags and a panel.`);
    return done;
  }

  /**
   * One pass over posts already marked Added that the assistant has not closed yet: post the lock
   * note and lock them. A post staff locked by hand is only recorded, and a post staff reopen after
   * the assistant closed it is left open.
   */
  public async closeAddedPosts(limit = this.config.backfillLimit): Promise<number> {
    const forum = await this.client.channels.fetch(this.config.forumChannelId).catch(() => null);
    if (forum?.type !== ChannelType.GuildForum) return 0;
    const tags = resolveForumTags(forum.availableTags);
    const pending = [...this.posts.values()].filter((post) => !post.closedAt && currentStatus(post.tagIds, tags) === "implemented").slice(0, limit);
    let done = 0;
    for (const post of pending) {
      if (this.stopped) break;
      const channel = await this.client.channels.fetch(post.threadId).catch(() => null);
      if (!this.isSuggestionThread(channel) || this.busyThreads.has(channel.id)) continue;
      try {
        if (channel.locked) {
          post.closedAt = new Date();
          await this.storage.markClosed(post.threadId, post.closedAt);
          continue;
        }
        await this.closePost(channel, post, true);
        await this.syncStaffPanel(post, tags, { locked: true }).catch(() => undefined);
        done += 1;
      } catch (error: unknown) {
        this.logger.warn(`Unable to lock added suggestion ${post.threadId}. ${describe(error)}`);
      }
      await this.wait(CATCH_UP_DELAY_MS);
    }
    if (done) this.logger.info(`Locked ${done} older suggestion(s) that were already added.`);
    return done;
  }

  /** Post a staff panel for every indexed suggestion that has none yet, oldest first so the newest end up at the bottom. */
  public async catchUpStaffPanels(limit = this.config.backfillLimit): Promise<number> {
    const tags = this.cachedTags();
    if (!tags || !this.config.staffChannelId) return 0;
    const pending = [...this.posts.values()].filter((post) => !post.staffMessageId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(-limit);
    let done = 0;
    for (const post of pending) {
      if (this.stopped) break;
      try {
        if (!await this.syncStaffPanel(post, tags, { locked: Boolean(post.closedAt) })) break;
        done += 1;
      } catch (error: unknown) {
        this.logger.warn(`Unable to post the staff panel for suggestion ${post.threadId}. ${describe(error)}`);
      }
      await this.wait(CATCH_UP_DELAY_MS);
    }
    if (done) this.logger.info(`Posted ${done} suggestion panel(s) in the staff channel.`);
    return done;
  }

  /** Lock and close an Added post, after a note that says why when `announce` is set. */
  private async closePost(thread: AnyThreadChannel, post: SuggestionPost, announce: boolean): Promise<void> {
    if (announce) await thread.send({ content: LOCK_NOTE, allowedMentions: { parse: [] } });
    await thread.edit({ locked: true, archived: true, reason: LOCK_REASON });
    post.closedAt = new Date();
    await this.storage.markClosed(thread.id, post.closedAt);
  }

  /** Post or refresh a suggestion's panel in the staff channel. Returns false when there is no usable staff channel. */
  private async syncStaffPanel(post: SuggestionPost, tags: ResolvedForumTags, options: { actorId?: string; locked?: boolean } = {}): Promise<boolean> {
    const channel = await this.staffChannel();
    if (!channel) return false;
    const payload = {
      components: [createStaffPanel({
        threadId: post.threadId,
        guildId: post.guildId,
        title: post.title,
        body: post.body,
        authorId: post.authorId ?? undefined,
        status: currentStatus(post.tagIds, tags),
        categories: categoriesOf(post.tagIds, tags).map((category) => CATEGORY_TAG_NAMES[category]),
        locked: options.locked ?? Boolean(post.closedAt),
        createdAt: post.createdAt,
        updatedBy: options.actorId || undefined,
      })],
      flags: MessageFlags.IsComponentsV2 as const,
      allowedMentions: { parse: [] },
    };
    if (post.staffMessageId) {
      try {
        const message = await channel.messages.fetch({ message: post.staffMessageId, force: true });
        await message.edit(payload);
        return true;
      } catch (error: unknown) {
        // Only a deleted panel is replaced; any other failure must not produce a duplicate.
        if (!(error instanceof DiscordAPIError && error.code === UNKNOWN_MESSAGE)) throw error;
      }
    }
    const message = await channel.send(payload);
    post.staffMessageId = message.id;
    await this.storage.updateStaffMessage(post.threadId, message.id);
    return true;
  }

  private async deleteStaffPanel(messageId: string): Promise<void> {
    const channel = await this.staffChannel();
    if (channel) await channel.messages.delete(messageId);
  }

  private async staffChannel() {
    if (!this.config.staffChannelId) return null;
    const channel = await this.client.channels.fetch(this.config.staffChannelId).catch(() => null);
    if (channel?.isSendable() && "messages" in channel && !channel.isDMBased() && !channel.isThread()) return channel;
    if (!this.staffChannelWarned) this.logger.warn("SUGGESTIONS_STAFF_CHANNEL_ID is not a text channel the bot can post in; staff panels are off.");
    this.staffChannelWarned = true;
    return null;
  }

  private async applyToThread(threadId: string, status: SuggestionStatus, change: StatusChange): Promise<LinkOutcome> {
    try {
      const channel = await this.client.channels.fetch(threadId).catch(() => null);
      if (!this.isSuggestionThread(channel)) return { threadId, ok: false, detail: "not a suggestion post" };
      await this.setStatus(channel, status, change);
      return { threadId, ok: true };
    } catch (error: unknown) {
      if (!(error instanceof SuggestionError)) this.logger.warn(`Unable to update suggestion ${threadId}. ${describe(error)}`);
      return { threadId, ok: false, detail: error instanceof SuggestionError ? error.message : "Discord refused the update" };
    }
  }

  private async refreshPanel(thread: AnyThreadChannel, post: SuggestionPost, tags: ResolvedForumTags, actorId?: string, featureName?: string): Promise<void> {
    if (!this.config.panel) return;
    const payload = { ...(await this.panelPayload(post, tags, actorId, featureName)), allowedMentions: { parse: [] } };
    if (post.panelMessageId) {
      try {
        const message = await thread.messages.fetch({ message: post.panelMessageId, force: true });
        await message.edit(payload);
        return;
      } catch (error: unknown) {
        // Only a deleted panel is replaced; any other failure must not produce a duplicate.
        if (!(error instanceof DiscordAPIError && error.code === UNKNOWN_MESSAGE)) throw error;
      }
    }
    const message = await thread.send(payload);
    post.panelMessageId = message.id;
    await this.storage.updatePanelMessage(thread.id, message.id);
  }

  private async panelPayload(post: SuggestionPost, tags: ResolvedForumTags, actorId?: string, featureName?: string) {
    const related = this.related(post.threadId, 3);
    const categories = categoriesOf(post.tagIds, tags);
    const linkedFeature = featureName ?? (await this.storage.featureForThread(post.guildId, post.threadId).catch(() => null))?.name;
    const work = await this.storage.workLinks(post.threadId, PANEL_WORK_LINKS).catch(() => []);
    const reply = composeNewPostReply({ seed: post.threadId, title: post.title, body: post.body, authorId: post.authorId ?? undefined, categories: categories.length ? categories : ["idea"], relatedCount: related.length, closestTitle: related[0] && related[0].score >= CLOSE_MATCH_SCORE ? related[0].title : undefined });
    return {
      components: [createAssistantPanel({ reply, status: currentStatus(post.tagIds, tags), related, updatedBy: actorId, featureName: linkedFeature, work })],
      flags: MessageFlags.IsComponentsV2 as const,
    };
  }

  private search(tokens: readonly string[], limit: number, minScore: number, exclude?: ReadonlySet<string>): RelatedPost[] {
    const tags = this.cachedTags();
    return this.index.similar(tokens, { limit, minScore, exclude }).flatMap((result) => {
      const post = this.posts.get(result.id);
      if (!post) return [];
      return [{ threadId: post.threadId, title: post.title, score: result.score, status: tags ? currentStatus(post.tagIds, tags) : undefined }];
    });
  }

  private cachedTags(): ResolvedForumTags | undefined {
    const forum = this.client.channels.cache.get(this.config.forumChannelId);
    return forum?.type === ChannelType.GuildForum ? resolveForumTags(forum.availableTags) : undefined;
  }

  private labelsFor(threadId: string, tags: ResolvedForumTags): SuggestionCategory[] {
    return categoriesOf(this.posts.get(threadId)?.tagIds ?? [], tags);
  }

  private remember(post: SuggestionPost): void {
    this.posts.set(post.threadId, post);
    this.index.set(post.threadId, postTokens(post));
  }

  private buildPost(thread: AnyThreadChannel, starter: Message | null): SuggestionPost {
    return {
      threadId: thread.id,
      guildId: thread.guildId,
      forumId: thread.parentId ?? this.config.forumChannelId,
      authorId: thread.ownerId ?? starter?.author.id ?? null,
      title: thread.name,
      body: starter?.content ?? "",
      tagIds: [...thread.appliedTags],
      panelMessageId: null,
      createdAt: thread.createdAt ?? new Date(),
    };
  }

  /** A forum post's starter message can arrive a moment after the thread itself. */
  private async fetchStarter(thread: AnyThreadChannel, delays: readonly number[]): Promise<Message | null> {
    for (const delay of delays) {
      if (delay > 0) await this.wait(delay);
      try {
        const message = await thread.fetchStarterMessage();
        if (message) return message;
      } catch {
        // Retry below; an unreadable starter leaves the title to carry the post.
      }
    }
    return null;
  }

  private async discussion(thread: AnyThreadChannel, limit: number): Promise<DiscussionMessage[]> {
    const messages: DiscussionMessage[] = [];
    let before: string | undefined;
    while (messages.length < limit) {
      const page = await thread.messages.fetch({ limit: Math.min(100, limit - messages.length), ...(before ? { before } : {}) });
      if (page.size === 0) break;
      for (const message of page.values()) {
        before = message.id;
        if (message.author.bot || message.system || !message.content.trim()) continue;
        messages.push({ authorId: message.author.id, content: message.content, createdAt: message.createdAt });
      }
      if (page.size < 100) break;
    }
    return messages;
  }

  private async prepareForum(): Promise<boolean> {
    const channel = await this.client.channels.fetch(this.config.forumChannelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildForum) {
      this.logger.warn("SUGGESTIONS_FORUM_CHANNEL_ID is not a forum channel the bot can see; the suggestion assistant is idle.");
      return false;
    }
    if (this.config.createMissingTags) await this.ensureStatusTags(channel);
    await this.backfill(channel);
    if (this.config.catchUp) await this.catchUp();
    if (this.config.lockAdded) await this.closeAddedPosts();
    if (this.config.staffChannelId) await this.catchUpStaffPanels();
    return true;
  }

  /** Add any missing status tags. Status tags are moderated so only staff can apply them. */
  public async ensureStatusTags(forum: ForumChannel): Promise<string[]> {
    const missing = missingStatusTagNames(forum.availableTags);
    const room = MAX_FORUM_TAGS - forum.availableTags.length;
    const toCreate = missing.slice(0, Math.max(0, room));
    if (missing.length > toCreate.length) this.logger.warn(`The suggestions forum has no room for ${missing.length - toCreate.length} status tag(s); Discord allows ${MAX_FORUM_TAGS}.`);
    if (toCreate.length === 0) return [];
    const existing: GuildForumTagData[] = forum.availableTags.map((tag) => ({ id: tag.id, name: tag.name, moderated: tag.moderated, emoji: tag.emoji }));
    const markerFor = (name: string): SuggestionStatus | undefined => Object.entries(STATUS_DEFINITIONS).find(([, definition]) => definition.tagName === name)?.[0] as SuggestionStatus | undefined;
    const created = (withEmoji: boolean): GuildForumTagData[] => toCreate.map((name) => {
      const status = markerFor(name);
      return { name, moderated: true, ...(withEmoji && status ? { emoji: { id: null, name: STATUS_MARKERS[status].replace(/\uFE0F/g, "") } } : {}) };
    });
    try {
      await forum.setAvailableTags([...existing, ...created(true)], "Suggestion assistant status tags");
    } catch {
      // Dev note: If Discord rejects an emoji, the tag still ships plain. Function over fashion, like a stillsuit.
      await forum.setAvailableTags([...existing, ...created(false)], "Suggestion assistant status tags");
    }
    this.logger.info(`Created suggestion status tag(s): ${toCreate.join(", ")}.`);
    return toCreate;
  }

  private async backfill(forum: ForumChannel): Promise<void> {
    const limit = this.config.backfillLimit;
    if (limit <= 0) return;
    const threads: AnyThreadChannel[] = [...(await forum.threads.fetchActive()).threads.values()];
    let before: AnyThreadChannel | undefined;
    while (threads.length < limit && !this.stopped) {
      const page = await forum.threads.fetchArchived({ type: "public", limit: 100, ...(before ? { before } : {}) });
      const values = [...page.threads.values()];
      threads.push(...values);
      before = values.at(-1);
      if (!page.hasMore || !before) break;
    }

    let added = 0;
    for (const thread of threads.slice(0, limit)) {
      if (this.stopped) break;
      const known = this.posts.get(thread.id);
      if (known) {
        if (known.title !== thread.name || !sameTags(known.tagIds, thread.appliedTags)) {
          const next = { ...known, title: thread.name, tagIds: [...thread.appliedTags] };
          this.remember(next);
          await this.storage.upsertPost(next);
        }
        continue;
      }
      const post = this.buildPost(thread, await this.fetchStarter(thread, [0]));
      this.remember(post);
      await this.storage.upsertPost(post);
      added += 1;
    }
    this.logger.info(`Suggestion index ready: ${this.index.size} post(s), ${added} new.`);
  }
}

function forumOf(thread: AnyThreadChannel): ForumChannel | null {
  const parent = thread.parent;
  return parent?.type === ChannelType.GuildForum ? parent : null;
}

function categoriesOf(tagIds: readonly string[], tags: ResolvedForumTags): SuggestionCategory[] {
  return tagIds.map((id) => tags.categoryByTagId.get(id)).filter((category): category is SuggestionCategory => Boolean(category));
}

function postTokens(post: Pick<SuggestionPost, "title" | "body">): string[] {
  // The title says what the post is about, so it counts twice.
  return tokenize(`${post.title}\n${post.title}\n${post.body}`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { SuggestionError, SuggestionService };
export type { StatusChange, SuggestionCompanion, SuggestionLogger, WorkOutcome };
