import { ChannelType, PermissionFlagsBits, type APIInteractionGuildMember, type Client, type GuildMember, type Message, type PermissionsBitField } from "discord.js";
import type { ChatbotConfig } from "../../../infrastructure/config/chatbot";
import { getBotVersion } from "../../../infrastructure/config/version";
import type { ChatbotStorage, LearnedAnswer, TaughtAnswer } from "../../../infrastructure/database/chatbot/ChatbotRepository";
import { getConfiguredStaffRoleIds } from "../../../support/access/staffAccess";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import { CHANGELOG_PROJECTS } from "../../changelog/changelogProjects";
import { buildFaqPanel } from "../faq/faqPanel";
import { HELP_CATEGORIES } from "../../help/helpCatalog";
import { levelForXp, xpForLevel } from "../leveling/levelProgress";
import { searchCatalog } from "../../players/administration/gameCatalogs";
import { formatSolari, getSolariSnapshot } from "../../players/leaderboard/solariLeaderboard";
import { parseCoriolisEnd, stormWindowFromEnd } from "../../world/storms/stormAnnouncement";
import { ChatBrain, type ChatMemory, type ChatSkills } from "./ChatBrain";
import { ChatKnowledge, commandEntries, faqEntries, learnedEntry, taughtEntry, type KnowledgeEntry } from "./chatbotKnowledge";
import { isQuestion, learnableAnswer, learnableQuestion } from "./chatbotLearning";
import type { WebLookupClient } from "../../../infrastructure/http/web/WebLookupClient";
import type { WebDataClient } from "../../../infrastructure/http/web/WebDataClient";
import type { LocalLanguageModel } from "../../../infrastructure/ai/LocalLanguageModel";
import { adjustRapport, feel, initialMood, moodLabel, settle, type FeelingEvent, type MoodState } from "./chatbotMood";

/**
 * Connects the homemade chatbot to Discord. It answers when a member mentions the bot, replies
 * to one of its answers or uses `/chat`; it learns questions and the answers members give them
 * in public channels; and it answers a question by itself when it is confident and nobody else
 * has answered first. Replies never ping anyone. Members can opt out of being learned from,
 * and a deleted message is forgotten with it.
 */

interface ChatbotLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

interface AccessSubject {
  userId: string;
  guildOwnerId: string | null;
  member: GuildMember | APIInteractionGuildMember | null;
  permissions: Readonly<PermissionsBitField> | null;
}

const MAX_TAUGHT_PER_GUILD = 500;
const MAX_MEMORY_ENTRIES = 2_000;
const MAX_ANSWER_IDS = 2_000;
/** Discord shows "typing…" for about 10 seconds per call. */
const TYPING_REFRESH_MS = 8_000;
/** Longest a message waits for the AI model to finish loading before the rules answer it instead. */
const AI_LOAD_WAIT_MS = 45_000;
const MAX_INPUT_LENGTH = 1_500;
const DISCORD_MESSAGE_LIMIT = 2_000;
/** How long a question waits for an answer in the next messages, when nobody uses Discord's reply. */
const IMPLICIT_ANSWER_WINDOW_MS = 3 * 60_000;
/** The same answer isn't repeated unasked in one channel within this window. */
const AUTO_REPEAT_WINDOW_MS = 10 * 60_000;

interface OpenQuestion {
  messageId: string;
  authorId: string;
  question: string;
  at: number;
}

interface PendingAuto {
  timer: NodeJS.Timeout;
  questionId: string;
  askerId: string;
}

class ChatbotService {
  private baseEntries?: readonly KnowledgeEntry[];
  private readonly knowledgeByGuild = new Map<string, ChatKnowledge>();
  private readonly loading = new Map<string, Promise<ChatKnowledge>>();
  private readonly memory = new Map<string, ChatMemory>();
  private readonly lastAnswerAt = new Map<string, number>();
  /** IDs of the bot's own chat answers, so a reply to one continues the conversation. */
  private readonly answerIds = new Set<string>();
  private readonly optOuts = new Map<string, Set<string>>();
  private readonly openQuestions = new Map<string, OpenQuestion>();
  private readonly pendingAuto = new Map<string, PendingAuto>();
  private readonly lastAutoAt = new Map<string, number>();
  private readonly recentAutoEntries = new Map<string, number>();
  private readonly moods = new Map<string, MoodState>();
  /** Messages already handled, so a re-delivered gateway event never gets a second reply. */
  private readonly handledMessages = new Set<string>();
  private stopped = false;

  public constructor(
    private readonly client: Client,
    public readonly config: ChatbotConfig,
    private readonly storage: ChatbotStorage | undefined,
    private readonly log: ChatbotLog,
    private readonly now: () => number = Date.now,
    private readonly web?: Pick<WebLookupClient, "lookup" | "research">,
    private readonly data?: Pick<WebDataClient, "define" | "weather" | "headlines" | "steamGame" | "convert" | "joke">,
    private readonly ai?: Pick<LocalLanguageModel, "ready" | "warmUp" | "whenReady" | "generate" | "stop">,
  ) {}

  /** FAQ and command entries, built on first use so every command piece is loaded by then. */
  private get base(): readonly KnowledgeEntry[] {
    this.baseEntries ??= Object.freeze([...faqEntries(buildFaqPanel()), ...commandEntries(helpCommands(this.client))]);
    return this.baseEntries;
  }

  public get canLearn(): boolean {
    return Boolean(this.storage);
  }

  public async initialize(): Promise<void> {
    // Fetch and load the AI model at startup, so it is ready before anyone asks. One shard does
    // it, so several shards never download the same file at once; the others load on first use.
    if (!this.client.shard || this.client.shard.ids.includes(0)) this.ai?.warmUp();
    await this.storage?.initialize();
  }

  public stop(): void {
    this.stopped = true;
    void this.ai?.stop();
    for (const pending of this.pendingAuto.values()) clearTimeout(pending.timer);
    this.pendingAuto.clear();
  }

  /** Staff (owner, Manage Server, or a configured staff role), plus the configured access rule. */
  public canUse(subject: AccessSubject): boolean {
    if (isChatStaff(subject)) return true;
    if (this.config.access === "everyone") return true;
    if (this.config.access === "roles") return memberRoleIds(subject.member).some((roleId) => this.config.roleIds.includes(roleId));
    return false;
  }

  public isStaff(subject: AccessSubject): boolean {
    return isChatStaff(subject);
  }

  /** Seconds left on the member's cooldown, or 0 when they may ask again. Starts a new one when 0. */
  public takeCooldown(userId: string): number {
    const now = this.now();
    const last = this.lastAnswerAt.get(userId);
    const wait = last === undefined ? 0 : this.config.cooldownSeconds * 1_000 - (now - last);
    if (wait > 0) return Math.ceil(wait / 1_000);
    this.lastAnswerAt.delete(userId);
    this.lastAnswerAt.set(userId, now);
    if (this.lastAnswerAt.size > MAX_MEMORY_ENTRIES) this.lastAnswerAt.delete(this.lastAnswerAt.keys().next().value!);
    return 0;
  }

  public async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || message.webhookId || message.system || !message.inGuild()) return;
    if (this.handledMessages.has(message.id)) return;
    this.handledMessages.add(message.id);
    if (this.handledMessages.size > MAX_ANSWER_IDS) this.handledMessages.delete(this.handledMessages.values().next().value!);
    const botId = this.client.user?.id;
    if (!botId || !this.isServed(message)) return;
    // Another shard's copy of the model loads on its first message (shard 0 loads it at startup).
    this.ai?.warmUp();
    const subject: AccessSubject = { userId: message.author.id, guildOwnerId: message.guild.ownerId, member: message.member, permissions: message.member?.permissions ?? null };
    if (!(await this.isAddressedToMe(message, botId))) {
      // Someone else talking in the channel means a person may be answering: the bot steps back.
      const pending = this.pendingAuto.get(message.channelId);
      if (pending && pending.askerId !== message.author.id) this.cancelAuto(message.channelId);
      await this.learnFrom(message, subject).catch((error: unknown) => this.log.warn(`Unable to learn from a message: ${error instanceof Error ? error.message : String(error)}`));
      await this.considerAutoReply(message, subject, botId);
      return;
    }
    if (!this.mentionChannelAllowed(message) || !this.canUse(subject)) return;
    if (this.takeCooldown(message.author.id) > 0) return;

    // The model can take a while to think: keep "typing…" showing until the answer is sent.
    const typing = (): void => void message.channel.sendTyping().catch(() => undefined);
    typing();
    const keepTyping = this.ai ? setInterval(typing, TYPING_REFRESH_MS) : undefined;
    const content = await this.answer({
      guildId: message.guildId,
      channelId: message.channelId,
      text: message.content,
      seed: message.id,
      userId: message.author.id,
      displayName: message.member?.displayName ?? message.author.displayName,
      serverName: message.guild.name,
      isStaff: isChatStaff(subject),
    }).finally(() => clearInterval(keepTyping));
    const sent = await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
    this.rememberAnswer(sent.id);
  }

  /** The full answer to one message, already sized for Discord. */
  public async answer(input: { guildId: string; channelId: string; text: string; seed: string; userId: string; displayName: string; serverName: string; isStaff: boolean }): Promise<string> {
    // A model that is still loading gets a short wait, so this message is answered by it too.
    if (this.ai && !this.ai.ready) await this.ai.whenReady(AI_LOAD_WAIT_MS);
    const knowledge = await this.knowledge(input.guildId);
    const memoryKey = `${input.channelId}:${input.userId}`;
    const brain = new ChatBrain(() => knowledge, this.skills(input.guildId), this.now);
    const mood = await this.currentMood(input.guildId);
    const rapport = await this.storage?.rapport(input.guildId, input.userId).catch(() => 0) ?? 0;
    const reply = await brain.reply({
      mood: mood.score,
      rapport,
      text: input.text.slice(0, MAX_INPUT_LENGTH),
      seed: input.seed,
      userId: input.userId,
      displayName: input.displayName,
      serverName: input.serverName,
      isStaff: input.isStaff,
      botId: this.client.user?.id,
      memory: this.memory.get(memoryKey),
    });
    this.memory.delete(memoryKey);
    this.memory.set(memoryKey, reply.memory);
    if (this.memory.size > MAX_MEMORY_ENTRIES) this.memory.delete(this.memory.keys().next().value!);
    this.recordUse(reply.usedEntryId);
    await this.react(input.guildId, input.userId, reply.feeling ?? "chat", rapport);
    return truncateDiscordText(reply.content, DISCORD_MESSAGE_LIMIT);
  }

  /** The bot's mood right now, eased back toward calm for the time that passed. */
  public async currentMood(guildId: string): Promise<MoodState> {
    let mood = this.moods.get(guildId);
    if (!mood) {
      const saved = await this.storage?.mood(guildId).catch(() => null);
      mood = saved ? { score: saved.score, updatedAt: saved.updatedAt.getTime() } : initialMood(this.now());
      this.moods.set(guildId, mood);
    }
    return settle(mood, this.now());
  }

  /** How the bot feels, in words, for `/chat mood`. */
  public async describeMood(guildId: string): Promise<{ label: string; score: number }> {
    const mood = await this.currentMood(guildId);
    return { label: moodLabel(mood.score), score: Math.round(mood.score) };
  }

  /** Update the mood and the asker's rapport after a message, and save both so they survive a restart. */
  private async react(guildId: string, userId: string, event: FeelingEvent, rapport: number): Promise<void> {
    const mood = feel(await this.currentMood(guildId), event, this.now());
    this.moods.set(guildId, mood);
    const optedOut = (await this.optedOutMembers(guildId).catch(() => new Set<string>())).has(userId);
    try {
      await this.storage?.saveMood(guildId, mood.score, new Date(mood.updatedAt));
      if (!optedOut) await this.storage?.saveRapport(guildId, userId, adjustRapport(rapport, event));
    } catch (error: unknown) {
      this.log.warn(`Unable to save the chatbot's mood: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Forget learned answers whose question or answer message was deleted. */
  public async handleDeleted(guildId: string, messageIds: readonly string[]): Promise<void> {
    for (const [channelId, open] of this.openQuestions) if (messageIds.includes(open.messageId)) this.openQuestions.delete(channelId);
    for (const [channelId, pending] of this.pendingAuto) if (messageIds.includes(pending.questionId)) this.cancelAuto(channelId);
    if (!this.storage || messageIds.length === 0) return;
    const removed = await this.storage.forgetMessages(guildId, messageIds);
    const knowledge = this.knowledgeByGuild.get(guildId);
    for (const id of removed) knowledge?.remove(`learned:${id}`);
  }

  /** Stop (or resume) learning from a member. Opting out also forgets everything learned from them. */
  public async setOptOut(guildId: string, userId: string, optedOut: boolean): Promise<number> {
    if (!this.storage) throw new RangeError("Learning needs the PostgreSQL database (`DATABASE_URL`).");
    await this.storage.setOptOut(guildId, userId, optedOut);
    const set = await this.optedOutMembers(guildId);
    if (optedOut) set.add(userId);
    else set.delete(userId);
    if (!optedOut) return 0;
    const removed = await this.storage.forgetMember(guildId, userId);
    if (removed > 0) this.knowledgeByGuild.delete(guildId);
    return removed;
  }

  public async learned(guildId: string): Promise<LearnedAnswer[]> {
    return this.storage ? this.storage.listLearned(guildId) : [];
  }

  public async unlearn(guildId: string, id: string): Promise<LearnedAnswer | null> {
    if (!this.storage) return null;
    const removed = await this.storage.forgetLearned(guildId, id);
    if (removed) this.knowledgeByGuild.get(guildId)?.remove(`learned:${removed.id}`);
    return removed;
  }

  public async purgeLearned(guildId: string): Promise<number> {
    if (!this.storage) return 0;
    const removed = await this.storage.purgeLearned(guildId);
    this.knowledgeByGuild.delete(guildId);
    this.log.info(`Forgot all ${removed} learned answers.`);
    return removed;
  }

  /**
   * Remember a question and the answer another member gave it: either a Discord reply to the
   * question, or the next message from someone else within a few minutes.
   */
  private async learnFrom(message: Message<true>, subject: AccessSubject): Promise<void> {
    if (!this.config.learn || !this.storage || !this.isPublic(message, this.config.learnChannelIds)) return;
    const optedOut = await this.optedOutMembers(message.guildId);
    if (optedOut.has(message.author.id)) return;
    const now = this.now();
    const open = this.openQuestions.get(message.channelId);

    let question: { messageId: string; authorId: string; text: string } | null = null;
    const referenceId = message.reference?.messageId;
    if (referenceId) {
      const referenced = await message.fetchReference().catch(() => null);
      const text = referenced && !referenced.author.bot && referenced.author.id !== message.author.id ? learnableQuestion(referenced.content) : null;
      if (referenced && text) question = { messageId: referenced.id, authorId: referenced.author.id, text };
    } else if (open && open.authorId !== message.author.id && now - open.at <= IMPLICIT_ANSWER_WINDOW_MS && message.mentions.users.size === 0) {
      question = { messageId: open.messageId, authorId: open.authorId, text: open.question };
    }

    const answer = question && !optedOut.has(question.authorId) ? learnableAnswer(message.content) : null;
    if (question && answer) {
      this.openQuestions.delete(message.channelId);
      const learned = await this.storage.learn({
        guildId: message.guildId,
        channelId: message.channelId,
        question: question.text,
        answer,
        askerId: question.authorId,
        answererId: message.author.id,
        questionMessageId: question.messageId,
        answerMessageId: message.id,
        fromStaff: isChatStaff(subject),
      }, this.config.learnLimit);
      if (learned) this.knowledgeByGuild.get(message.guildId)?.add(learnedEntry(learned));
      return;
    }

    const asked = !referenceId && message.mentions.users.size === 0 ? learnableQuestion(message.content) : null;
    if (asked) {
      this.openQuestions.set(message.channelId, { messageId: message.id, authorId: message.author.id, question: asked, at: now });
      if (this.openQuestions.size > MAX_MEMORY_ENTRIES) this.openQuestions.delete(this.openQuestions.keys().next().value!);
    } else if (open && now - open.at > IMPLICIT_ANSWER_WINDOW_MS) {
      this.openQuestions.delete(message.channelId);
    }
  }

  /**
   * Answer a question nobody asked the bot, but only when the answer is confident, the channel
   * hasn't heard from the bot recently, and no other member answers during the short wait.
   */
  private async considerAutoReply(message: Message<true>, subject: AccessSubject, botId: string): Promise<void> {
    if (!this.config.autoReply || this.stopped || !this.isPublic(message, this.config.autoChannelIds)) return;
    if (message.reference?.messageId || message.mentions.users.size > 0 || message.mentions.roles.size > 0) return;
    if (!isQuestion(message.content) || this.pendingAuto.has(message.channelId)) return;
    const now = this.now();
    if (now - (this.lastAutoAt.get(message.channelId) ?? -Infinity) < this.config.autoCooldownSeconds * 1_000) return;

    const knowledge = await this.knowledge(message.guildId);
    const brain = new ChatBrain(() => knowledge, this.skills(message.guildId), this.now);
    const reply = await brain.autoReply({
      text: message.content.slice(0, MAX_INPUT_LENGTH),
      seed: message.id,
      userId: message.author.id,
      displayName: message.member?.displayName ?? message.author.displayName,
      serverName: message.guild.name,
      isStaff: isChatStaff(subject),
      botId,
      mood: (await this.currentMood(message.guildId)).score,
    }, this.config.autoConfidence, this.config.webAuto).catch(() => null);
    if (!reply) return;
    const repeatKey = `${message.channelId}:${reply.usedEntryId ?? reply.content}`;
    if (now - (this.recentAutoEntries.get(repeatKey) ?? -Infinity) < AUTO_REPEAT_WINDOW_MS) return;

    const send = async (): Promise<void> => {
      this.pendingAuto.delete(message.channelId);
      if (this.stopped) return;
      this.lastAutoAt.set(message.channelId, this.now());
      this.recentAutoEntries.set(repeatKey, this.now());
      if (this.recentAutoEntries.size > MAX_MEMORY_ENTRIES) this.recentAutoEntries.delete(this.recentAutoEntries.keys().next().value!);
      const sent = await message.reply({ content: truncateDiscordText(reply.content, DISCORD_MESSAGE_LIMIT), allowedMentions: { parse: [], repliedUser: false } });
      this.rememberAnswer(sent.id);
      this.recordUse(reply.usedEntryId);
    };
    if (this.config.autoDelaySeconds === 0) {
      await send();
      return;
    }
    // Dev note: Give the humans a head start; the desert rewards patience, and so does chat.
    const timer = setTimeout(() => {
      void send().catch((error: unknown) => this.log.warn(`Unable to post an automatic answer: ${error instanceof Error ? error.message : String(error)}`));
    }, this.config.autoDelaySeconds * 1_000);
    timer.unref?.();
    this.pendingAuto.set(message.channelId, { timer, questionId: message.id, askerId: message.author.id });
  }

  private cancelAuto(channelId: string): void {
    const pending = this.pendingAuto.get(channelId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAuto.delete(channelId);
  }

  private recordUse(entryId: string | undefined): void {
    if (!entryId || !this.storage) return;
    const [source, id] = entryId.split(":");
    if (!id) return;
    if (source === "taught") void this.storage.recordUse(id).catch(() => undefined);
    if (source === "learned") void this.storage.recordLearnedUse(id).catch(() => undefined);
  }

  private async optedOutMembers(guildId: string): Promise<Set<string>> {
    const cached = this.optOuts.get(guildId);
    if (cached) return cached;
    const set = new Set(this.storage ? await this.storage.optedOut(guildId) : []);
    this.optOuts.set(guildId, set);
    return set;
  }

  /** Learning and automatic answers stay in channels everyone can see, unless channels are listed. */
  private isPublic(message: Message<true>, channelIds: readonly string[]): boolean {
    const channel = message.channel;
    const parentId = channel.isThread() ? channel.parentId : null;
    if (channelIds.length > 0) return channelIds.includes(message.channelId) || (parentId !== null && channelIds.includes(parentId));
    if (channel.isThread() && channel.type === ChannelType.PrivateThread) return false;
    const base = channel.isThread() ? channel.parent : channel;
    const everyone = message.guild.roles?.everyone;
    if (!base || !everyone || !("permissionsFor" in base)) return false;
    return Boolean(base.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel));
  }

  public async teach(guildId: string, question: string, answer: string, createdBy: string): Promise<TaughtAnswer> {
    if (!this.storage) throw new Error("Teaching the chatbot needs DATABASE_URL.");
    if ((await this.storage.count(guildId)) >= MAX_TAUGHT_PER_GUILD) throw new RangeError(`The chatbot already knows ${MAX_TAUGHT_PER_GUILD} taught answers. Remove some with /chat forget first.`);
    const taught = await this.storage.add(guildId, question.trim(), answer.trim(), createdBy);
    this.knowledgeByGuild.get(guildId)?.add(taughtEntry(taught));
    this.log.info(`Learned answer #${taught.id} from ${createdBy}.`);
    return taught;
  }

  public async forget(guildId: string, id: string): Promise<TaughtAnswer | null> {
    if (!this.storage) return null;
    const removed = await this.storage.remove(guildId, id);
    if (removed) this.knowledgeByGuild.get(guildId)?.remove(`taught:${removed.id}`);
    return removed;
  }

  public async taught(guildId: string): Promise<TaughtAnswer[]> {
    return this.storage ? this.storage.list(guildId) : [];
  }

  private async knowledge(guildId: string): Promise<ChatKnowledge> {
    const ready = this.knowledgeByGuild.get(guildId);
    if (ready) return ready;
    const pending = this.loading.get(guildId);
    if (pending) return pending;
    const load = (async () => {
      let taught: TaughtAnswer[];
      let learned: LearnedAnswer[];
      try {
        [taught, learned] = this.storage ? await Promise.all([this.storage.list(guildId), this.storage.listLearned(guildId)]) : [[], []];
      } catch (error: unknown) {
        // Answer from the FAQ and commands for now; the next message tries the database again.
        this.log.warn(`Unable to load chatbot answers: ${error instanceof Error ? error.message : String(error)}`);
        return new ChatKnowledge(this.base);
      }
      const knowledge = new ChatKnowledge([...this.base, ...taught.map(taughtEntry), ...learned.map(learnedEntry)]);
      this.knowledgeByGuild.set(guildId, knowledge);
      return knowledge;
    })().finally(() => this.loading.delete(guildId));
    this.loading.set(guildId, load);
    return load;
  }

  private skills(guildId: string): ChatSkills {
    const client = this.client;
    const leveling = client.leveling;
    // Dev note: Every skill is read-only. The chatbot may talk about the desert, never move the sand.
    return {
      level: leveling ? async (userId) => {
        const profile = await leveling.profile(guildId, userId);
        const level = levelForXp(profile.xp);
        return { level, xp: profile.xp, rank: profile.rank, nextLevelXp: xpForLevel(level + 1) };
      } : undefined,
      levelTop: leveling ? async () => (await leveling.leaderboard(guildId, 5)).map((profile) => ({ userId: profile.userId, level: levelForXp(profile.xp), xp: profile.xp })) : undefined,
      solariTop: client.duneApi ? async () => (await getSolariSnapshot(client.duneApi)).entries.slice(0, 5).map((entry) => ({ name: entry.name, balance: formatSolari(entry.balance) })) : undefined,
      storm: client.duneApi ? async () => stormWindowFromEnd(parseCoriolisEnd(await client.duneApi.call("GET", "/api/map/markers", { query: { static: 0 }, cacheTtlMs: 60_000 }))) : undefined,
      serverStatus: client.duneApi ? async () => parseStatus(await client.duneApi.call("GET", "/api/server/status", { cacheTtlMs: 15_000 })) : undefined,
      changelog: client.dashboardChangelog ? async () => {
        const snapshot = await client.dashboardChangelog!.getReleases();
        const bot = CHANGELOG_PROJECTS[0]!.key;
        const release = snapshot.releases.find((entry) => entry.project === bot);
        if (!release) return null;
        return { version: release.version.replace(/^v/, ""), highlights: release.sections.flatMap((section) => section.items).map(firstSentence) };
      } : undefined,
      items: (query) => searchCatalog("items", query, 25).map((item) => ({ name: item.name, id: item.value, detail: item.detail })),
      web: this.web ? (subject, hint) => this.web!.lookup(subject, hint) : undefined,
      research: this.web && this.ai?.ready ? (question) => this.web!.research(question) : undefined,
      ...(this.data ? this.dataSkills(this.data) : {}),
      think: this.ai?.ready ? (request) => this.ai!.generate(request) : undefined,
      botInfo: () => ({ version: getBotVersion(), uptimeMs: client.uptime ?? 0, pingMs: client.ws.ping >= 0 ? client.ws.ping : null }),
    };
  }

  private dataSkills(data: NonNullable<ChatbotService["data"]>): Partial<ChatSkills> {
    return {
      define: (word) => data.define(word),
      weather: (place) => data.weather(place),
      news: (topic) => data.headlines(topic),
      steam: (game) => data.steamGame(game),
      convert: (amount, from, to) => data.convert(amount, from, to),
      joke: () => data.joke(),
    };
  }

  /** Answer in allowed guilds and channels, and leave channels other features own alone. */
  private isServed(message: Message<true>): boolean {
    const allowed = this.client.allowedGuildIds ?? [];
    if (allowed.length > 0 && !allowed.includes(message.guildId)) return false;
    if (this.client.suggestions?.isSuggestionThread(message.channel)) return false;
    if (this.client.honeypot?.isHoneypot(message)) return false;
    if (this.client.music && message.channelId === this.client.music.config.requestChannelId) return false;
    return true;
  }

  private mentionChannelAllowed(message: Message<true>): boolean {
    if (this.config.channelIds.length === 0) return true;
    const parentId = message.channel.isThread() ? message.channel.parentId : null;
    return this.config.channelIds.includes(message.channelId) || (parentId !== null && this.config.channelIds.includes(parentId));
  }

  /** A direct @mention of the bot, or a reply to one of its chat answers. Role and @everyone pings don't count. */
  private async isAddressedToMe(message: Message<true>, botId: string): Promise<boolean> {
    if (new RegExp(`<@!?${botId}>`).test(message.content)) return true;
    const referenceId = message.reference?.messageId;
    if (!referenceId || message.mentions.repliedUser?.id !== botId) return false;
    if (this.answerIds.has(referenceId)) return true;
    // After a restart the set is empty: a plain-text reply the bot sent to someone counts too.
    const referenced = await message.fetchReference().catch(() => null);
    return Boolean(referenced && referenced.author.id === botId && referenced.reference && referenced.components.length === 0 && referenced.embeds.length === 0 && referenced.content);
  }

  private rememberAnswer(id: string): void {
    this.answerIds.add(id);
    if (this.answerIds.size > MAX_ANSWER_IDS) this.answerIds.delete(this.answerIds.values().next().value!);
  }
}

function isChatStaff(subject: AccessSubject): boolean {
  if (subject.guildOwnerId && subject.userId === subject.guildOwnerId) return true;
  if (subject.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const staffRoles = getConfiguredStaffRoleIds();
  return memberRoleIds(subject.member).some((roleId) => staffRoles.includes(roleId));
}

function memberRoleIds(member: AccessSubject["member"]): string[] {
  if (!member) return [];
  return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

/** Every command in `/help`, described the way Discord shows it. */
function helpCommands(client: Client): { name: string; description?: string; access?: string }[] {
  const store = client.stores?.get("commands");
  return HELP_CATEGORIES.flatMap((category) => category.commands.map((command) => {
    const [top = command.name] = command.name.split(" ");
    const piece = store?.get(top);
    const description = command.description ?? (piece?.description ? `${piece.description}${command.name === top ? "" : ` (${command.name.slice(top.length + 1)})`}` : undefined);
    return { name: command.name, description, access: command.access ?? category.access };
  }));
}

function parseStatus(response: unknown): { overall: string; population: string; region: string } {
  const stdout = response && typeof response === "object" && "stdout" in response && typeof response.stdout === "string" ? response.stdout : "";
  const read = (pattern: RegExp): string => pattern.exec(stdout)?.[1]?.trim().slice(0, 80) ?? "Unknown";
  return { overall: read(/Overall:\s+(.+)/), population: read(/Population:\s+(.+)/), region: read(/Region:\s+(.+)/) };
}

function firstSentence(value: string): string {
  const plain = value.replace(/`/g, "").replace(/\s+/g, " ").trim();
  const sentence = /^(.{20,220}?[.!?])(\s|$)/.exec(plain)?.[1] ?? plain;
  return sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence;
}

export { ChatbotService, isChatStaff };
export type { AccessSubject, ChatbotLog };
