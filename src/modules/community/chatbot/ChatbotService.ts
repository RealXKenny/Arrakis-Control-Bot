import { PermissionFlagsBits, type APIInteractionGuildMember, type Client, type GuildMember, type Message, type PermissionsBitField } from "discord.js";
import type { ChatbotConfig } from "../../../infrastructure/config/chatbot";
import { getBotVersion } from "../../../infrastructure/config/version";
import type { ChatbotStorage, TaughtAnswer } from "../../../infrastructure/database/chatbot/ChatbotRepository";
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
import { ChatKnowledge, commandEntries, faqEntries, taughtEntry, type KnowledgeEntry } from "./chatbotKnowledge";

/**
 * Connects the homemade chatbot to Discord: it answers when a member mentions the bot or
 * replies to one of its answers, and through `/chat`. Access is checked on every message,
 * each member has a short cooldown, and replies never ping anyone.
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
const MAX_INPUT_LENGTH = 1_500;
const DISCORD_MESSAGE_LIMIT = 2_000;

class ChatbotService {
  private baseEntries?: readonly KnowledgeEntry[];
  private readonly knowledgeByGuild = new Map<string, ChatKnowledge>();
  private readonly loading = new Map<string, Promise<ChatKnowledge>>();
  private readonly memory = new Map<string, ChatMemory>();
  private readonly lastAnswerAt = new Map<string, number>();
  /** IDs of the bot's own chat answers, so a reply to one continues the conversation. */
  private readonly answerIds = new Set<string>();

  public constructor(
    private readonly client: Client,
    public readonly config: ChatbotConfig,
    private readonly storage: ChatbotStorage | undefined,
    private readonly log: ChatbotLog,
    private readonly now: () => number = Date.now,
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
    await this.storage?.initialize();
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
    const botId = this.client.user?.id;
    if (!botId || !this.isServed(message)) return;
    if (!(await this.isAddressedToMe(message, botId))) return;
    const subject: AccessSubject = { userId: message.author.id, guildOwnerId: message.guild.ownerId, member: message.member, permissions: message.member?.permissions ?? null };
    if (!this.canUse(subject)) return;
    if (this.takeCooldown(message.author.id) > 0) return;

    void message.channel.sendTyping().catch(() => undefined);
    const content = await this.answer({
      guildId: message.guildId,
      channelId: message.channelId,
      text: message.content,
      seed: message.id,
      userId: message.author.id,
      displayName: message.member?.displayName ?? message.author.displayName,
      serverName: message.guild.name,
      isStaff: isChatStaff(subject),
    });
    const sent = await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
    this.rememberAnswer(sent.id);
  }

  /** The full answer to one message, already sized for Discord. */
  public async answer(input: { guildId: string; channelId: string; text: string; seed: string; userId: string; displayName: string; serverName: string; isStaff: boolean }): Promise<string> {
    const knowledge = await this.knowledge(input.guildId);
    const memoryKey = `${input.channelId}:${input.userId}`;
    const brain = new ChatBrain(() => knowledge, this.skills(input.guildId), this.now);
    const reply = await brain.reply({
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
    if (reply.taughtId) void this.storage?.recordUse(reply.taughtId).catch(() => undefined);
    return truncateDiscordText(reply.content, DISCORD_MESSAGE_LIMIT);
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
      try {
        taught = this.storage ? await this.storage.list(guildId) : [];
      } catch (error: unknown) {
        // Answer from the FAQ and commands for now; the next message tries the database again.
        this.log.warn(`Unable to load taught chatbot answers: ${error instanceof Error ? error.message : String(error)}`);
        return new ChatKnowledge(this.base);
      }
      const knowledge = new ChatKnowledge([...this.base, ...taught.map(taughtEntry)]);
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
      botInfo: () => ({ version: getBotVersion(), uptimeMs: client.uptime ?? 0, pingMs: client.ws.ping >= 0 ? client.ws.ping : null }),
    };
  }

  /** Answer in allowed guilds and channels, and leave channels other features own alone. */
  private isServed(message: Message<true>): boolean {
    const allowed = this.client.allowedGuildIds ?? [];
    if (allowed.length > 0 && !allowed.includes(message.guildId)) return false;
    if (this.client.suggestions?.isSuggestionThread(message.channel)) return false;
    if (this.client.honeypot?.isHoneypot(message)) return false;
    if (this.client.music && message.channelId === this.client.music.config.requestChannelId) return false;
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
