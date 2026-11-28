import { PermissionFlagsBits, PermissionsBitField, type Client, type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatbotConfig } from "../../../../src/infrastructure/config/chatbot";
import type { ChatbotStorage, LearnedAnswer, TaughtAnswer } from "../../../../src/infrastructure/database/chatbot/ChatbotRepository";
import { ChatbotService } from "../../../../src/modules/community/chatbot/ChatbotService";

const BOT = "100000000000000001";
const GUILD = "500000000000000005";
const OWNER = "600000000000000006";
const MEMBER = "300000000000000003";
const STAFF_ROLE = "700000000000000007";
const FRIEND_ROLE = "800000000000000008";
const CHANNEL = "900000000000000009";

const config = (overrides: Partial<ChatbotConfig> = {}): ChatbotConfig => ({
  access: "staff", roleIds: [], channelIds: [], cooldownSeconds: 3,
  learn: false, learnChannelIds: [], learnLimit: 5_000,
  autoReply: false, autoChannelIds: [], autoConfidence: 0.5, autoDelaySeconds: 0, autoCooldownSeconds: 60,
  web: false, webPerMinute: 20, webAuto: false,
  ...overrides,
});
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function memoryStorage(): ChatbotStorage & { rows: TaughtAnswer[]; learnedRows: LearnedAnswer[]; optOuts: Set<string> } {
  const rows: TaughtAnswer[] = [];
  const learnedRows: LearnedAnswer[] = [];
  const optOuts = new Set<string>();
  const rapport = new Map<string, number>();
  let savedMood: { score: number; updatedAt: Date } | null = null;
  let next = 1;
  return {
    rows,
    learnedRows,
    optOuts,
    listLearned: (guildId) => Promise.resolve(learnedRows.filter((row) => row.guildId === guildId)),
    learn: (answer) => {
      if (optOuts.has(answer.askerId) || optOuts.has(answer.answererId) || learnedRows.some((row) => row.answerMessageId === answer.answerMessageId)) return Promise.resolve(null);
      const row = { ...answer, id: String(next++), createdAt: new Date(0), uses: 0 };
      learnedRows.push(row);
      return Promise.resolve(row);
    },
    forgetMessages: (guildId, ids) => {
      const gone = learnedRows.filter((row) => row.guildId === guildId && (ids.includes(row.questionMessageId) || ids.includes(row.answerMessageId)));
      for (const row of gone) learnedRows.splice(learnedRows.indexOf(row), 1);
      return Promise.resolve(gone.map((row) => row.id));
    },
    forgetLearned: (guildId, id) => {
      const index = learnedRows.findIndex((row) => row.guildId === guildId && row.id === id);
      return Promise.resolve(index < 0 ? null : learnedRows.splice(index, 1)[0]!);
    },
    forgetMember: (guildId, userId) => {
      const gone = learnedRows.filter((row) => row.guildId === guildId && (row.askerId === userId || row.answererId === userId));
      for (const row of gone) learnedRows.splice(learnedRows.indexOf(row), 1);
      return Promise.resolve(gone.length);
    },
    purgeLearned: () => Promise.resolve(learnedRows.splice(0).length),
    recordLearnedUse: () => Promise.resolve(),
    mood: () => Promise.resolve(savedMood),
    saveMood: (_guildId, score, updatedAt) => {
      savedMood = { score, updatedAt };
      return Promise.resolve();
    },
    rapport: (_guildId, userId) => Promise.resolve(rapport.get(userId) ?? 0),
    saveRapport: (_guildId, userId, score) => {
      rapport.set(userId, score);
      return Promise.resolve();
    },
    optedOut: () => Promise.resolve([...optOuts]),
    setOptOut: (_guildId, userId, optedOut) => {
      if (optedOut) optOuts.add(userId);
      else optOuts.delete(userId);
      return Promise.resolve();
    },
    initialize: () => Promise.resolve(),
    list: (guildId) => Promise.resolve(rows.filter((row) => row.guildId === guildId)),
    count: (guildId) => Promise.resolve(rows.filter((row) => row.guildId === guildId).length),
    add: (guildId, question, answer, createdBy) => {
      const row = { id: String(next++), guildId, question, answer, createdBy, createdAt: new Date(0), uses: 0 };
      rows.push(row);
      return Promise.resolve(row);
    },
    remove: (guildId, id) => {
      const index = rows.findIndex((row) => row.guildId === guildId && row.id === id);
      return Promise.resolve(index < 0 ? null : rows.splice(index, 1)[0]!);
    },
    recordUse: () => Promise.resolve(),
  };
}

function fakeClient(extra: Record<string, unknown> = {}): Client {
  return { user: { id: BOT }, allowedGuildIds: [GUILD], uptime: 1_000, ws: { ping: 10 }, stores: undefined, ...extra } as unknown as Client;
}

const EVERYONE = { id: GUILD };

function message(content: string, options: { id?: string; roles?: string[]; author?: string; reply?: { authorId: string; id: string; plain?: boolean; content?: string }; channelId?: string; manageGuild?: boolean; privateChannel?: boolean } = {}): Message & { reply: ReturnType<typeof vi.fn> } {
  const roles = options.roles ?? [];
  const sent = { id: `sent-${Math.random()}` };
  const referenced = options.reply ? { id: options.reply.id, author: { id: options.reply.authorId, bot: options.reply.authorId === BOT }, reference: options.reply.plain === false ? null : { messageId: "x" }, components: [], embeds: [], content: options.reply.content ?? "hi" } : null;
  return {
    id: options.id ?? `m-${content}`,
    content,
    author: { id: options.author ?? MEMBER, bot: false, displayName: "Member" },
    webhookId: null,
    system: false,
    inGuild: () => true,
    guildId: GUILD,
    guild: { ownerId: OWNER, name: "Crimson Skies", roles: { everyone: EVERYONE } },
    channelId: options.channelId ?? CHANNEL,
    channel: { isThread: () => false, sendTyping: vi.fn(() => Promise.resolve()), permissionsFor: () => ({ has: () => !options.privateChannel }) },
    member: { displayName: "Member", roles: { cache: new Map(roles.map((role) => [role, {}])) }, permissions: new PermissionsBitField(options.manageGuild ? PermissionFlagsBits.ManageGuild : 0n) },
    reference: options.reply ? { messageId: options.reply.id } : null,
    mentions: { repliedUser: options.reply ? { id: options.reply.authorId } : null, users: new Map([...content.matchAll(/<@!?(\d+)>/g)].map((match) => [match[1], {}])), roles: new Map() },
    fetchReference: vi.fn(() => Promise.resolve(referenced)),
    reply: vi.fn(() => Promise.resolve(sent)),
  } as unknown as Message & { reply: ReturnType<typeof vi.fn> };
}

describe("ChatbotService", () => {
  beforeEach(() => {
    vi.stubEnv("MODERATOR_ROLE_ID", STAFF_ROLE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts the AI model download at startup on shard 0 only", async () => {
    const ai = () => ({ ready: false, warmUp: vi.fn(), whenReady: vi.fn(() => Promise.resolve(false)), generate: vi.fn(() => Promise.resolve(null)), stop: vi.fn(() => Promise.resolve()) });
    const single = ai();
    await new ChatbotService(fakeClient(), config(), undefined, log, Date.now, undefined, undefined, single).initialize();
    expect(single.warmUp).toHaveBeenCalledTimes(1);
    const other = ai();
    await new ChatbotService(fakeClient({ shard: { ids: [1] } }), config(), undefined, log, Date.now, undefined, undefined, other).initialize();
    expect(other.warmUp).not.toHaveBeenCalled();
    const first = ai();
    await new ChatbotService(fakeClient({ shard: { ids: [0] } }), config(), undefined, log, Date.now, undefined, undefined, first).initialize();
    expect(first.warmUp).toHaveBeenCalledTimes(1);
  });

  it("answers staff who mention it, without pinging anyone", async () => {
    const service = new ChatbotService(fakeClient(), config(), undefined, log);
    const incoming = message(`<@${BOT}> how are you?`, { roles: [STAFF_ROLE] });
    await service.handleMessage(incoming);
    expect(incoming.reply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [], repliedUser: false } }));
  });

  it("ignores members without access, messages not meant for it, and other guilds", async () => {
    const service = new ChatbotService(fakeClient(), config(), undefined, log);
    const member = message(`<@${BOT}> hello`);
    await service.handleMessage(member);
    expect(member.reply).not.toHaveBeenCalled();

    const unaddressed = message("hello everyone", { roles: [STAFF_ROLE] });
    await service.handleMessage(unaddressed);
    expect(unaddressed.reply).not.toHaveBeenCalled();

    const elsewhere = new ChatbotService(fakeClient({ allowedGuildIds: ["111111111111111111"] }), config(), undefined, log);
    const other = message(`<@${BOT}> hello`, { roles: [STAFF_ROLE] });
    await elsewhere.handleMessage(other);
    expect(other.reply).not.toHaveBeenCalled();
  });

  it("lets the owner, Manage Server, listed roles or everyone in when configured", () => {
    const staffOnly = new ChatbotService(fakeClient(), config(), undefined, log);
    const subject = (userId: string, roles: string[] = [], manageGuild = false) => ({
      userId, guildOwnerId: OWNER, member: { roles } as never, permissions: new PermissionsBitField(manageGuild ? PermissionFlagsBits.ManageGuild : 0n),
    });
    expect(staffOnly.canUse(subject(OWNER))).toBe(true);
    expect(staffOnly.canUse(subject(MEMBER, [], true))).toBe(true);
    expect(staffOnly.canUse(subject(MEMBER, [STAFF_ROLE]))).toBe(true);
    expect(staffOnly.canUse(subject(MEMBER, [FRIEND_ROLE]))).toBe(false);
    expect(new ChatbotService(fakeClient(), config({ access: "roles", roleIds: [FRIEND_ROLE] }), undefined, log).canUse(subject(MEMBER, [FRIEND_ROLE]))).toBe(true);
    expect(new ChatbotService(fakeClient(), config({ access: "everyone" }), undefined, log).canUse(subject(MEMBER))).toBe(true);
  });

  it("continues a conversation when someone replies to its answer, even after a restart", async () => {
    const service = new ChatbotService(fakeClient(), config({ access: "everyone", cooldownSeconds: 0 }), undefined, log);
    const reply = message("tell me a joke", { reply: { authorId: BOT, id: "old-answer" } });
    await service.handleMessage(reply);
    expect(reply.reply).toHaveBeenCalledTimes(1);

    const toPanel = message("tell me a joke", { reply: { authorId: BOT, id: "panel", plain: false } });
    await service.handleMessage(toPanel);
    expect(toPanel.reply).not.toHaveBeenCalled();
  });

  it("stays out of restricted channels and channels other features own", async () => {
    const limited = new ChatbotService(fakeClient(), config({ access: "everyone", channelIds: ["999999999999999999"] }), undefined, log);
    const outside = message(`<@${BOT}> hi`);
    await limited.handleMessage(outside);
    expect(outside.reply).not.toHaveBeenCalled();

    const music = new ChatbotService(fakeClient({ music: { config: { requestChannelId: CHANNEL } } }), config({ access: "everyone" }), undefined, log);
    const request = message(`<@${BOT}> play sandstorm`);
    await music.handleMessage(request);
    expect(request.reply).not.toHaveBeenCalled();
  });

  it("applies a per-member cooldown", () => {
    let now = 0;
    const service = new ChatbotService(fakeClient(), config({ cooldownSeconds: 5 }), undefined, log, () => now);
    expect(service.takeCooldown(MEMBER)).toBe(0);
    now = 2_000;
    expect(service.takeCooldown(MEMBER)).toBe(3);
    now = 5_000;
    expect(service.takeCooldown(MEMBER)).toBe(0);
  });

  it("learns and forgets answers right away", async () => {
    const storage = memoryStorage();
    const service = new ChatbotService(fakeClient(), config(), storage, log);
    const ask = (text: string) => service.answer({ guildId: GUILD, channelId: CHANNEL, text, seed: text, userId: MEMBER, displayName: "Member", serverName: "Crimson Skies", isStaff: true });

    expect(await ask("when is movie night")).not.toContain("Friday");
    const taught = await service.teach(GUILD, "When is movie night?", "Every Friday at 8 PM ET.", OWNER);
    expect(await ask("when is movie night")).toBe("Every Friday at 8 PM ET.");
    expect(await service.forget(GUILD, taught.id)).toMatchObject({ id: taught.id });
    expect(await ask("when is movie night")).not.toContain("Friday");
  });

  it("refuses to learn without a database or past the limit", async () => {
    await expect(new ChatbotService(fakeClient(), config(), undefined, log).teach(GUILD, "q?", "a", OWNER)).rejects.toThrow("DATABASE_URL");
    const storage = memoryStorage();
    storage.count = () => Promise.resolve(500);
    await expect(new ChatbotService(fakeClient(), config(), storage, log).teach(GUILD, "q?", "a", OWNER)).rejects.toBeInstanceOf(RangeError);
  });

  it("learns a member's answer to a question, keeps it across restarts and forgets it when deleted", async () => {
    const storage = memoryStorage();
    const client = fakeClient();
    const service = new ChatbotService(client, config({ access: "everyone", learn: true }), storage, log);
    const question = message("Where do I find titanium ore?", { id: "q1", author: OWNER });
    await service.handleMessage(question);
    await service.handleMessage(message("Titanium is in the rock outcrops near the shield wall.", { id: "a1", author: MEMBER }));
    expect(storage.learnedRows).toHaveLength(1);
    expect(storage.learnedRows[0]).toMatchObject({ question: "Where do I find titanium ore?", askerId: OWNER, answererId: MEMBER, fromStaff: false });

    // A fresh service (as after a restart) answers from what was saved in the database.
    const restarted = new ChatbotService(client, config({ access: "everyone" }), storage, log);
    const ask = (text: string) => restarted.answer({ guildId: GUILD, channelId: CHANNEL, text, seed: text, userId: STAFF_ROLE, displayName: "New", serverName: "Crimson Skies", isStaff: false });
    const answer = await ask("where can I find titanium ore");
    expect(answer).toContain("rock outcrops near the shield wall");
    expect(answer).toContain(`https://discord.com/channels/${GUILD}/${CHANNEL}/a1`);

    await restarted.handleDeleted(GUILD, ["a1"]);
    expect(storage.learnedRows).toHaveLength(0);
    expect(await ask("where can I find titanium ore")).not.toContain("shield wall");
  });

  it("learns from Discord replies, but not from private channels, opted-out members or non-answers", async () => {
    const storage = memoryStorage();
    const service = new ChatbotService(fakeClient(), config({ access: "everyone", learn: true }), storage, log);
    await service.handleMessage(message("Spice blooms show up after a storm, look for the orange dust.", { id: "a2", author: MEMBER, reply: { authorId: OWNER, id: "q2", content: "When do spice blooms happen?" } }));
    expect(storage.learnedRows.map((row) => row.question)).toEqual(["When do spice blooms happen?"]);

    await service.handleMessage(message("Where is the private stash kept?", { id: "q3", author: OWNER, privateChannel: true }));
    await service.handleMessage(message("It is behind the third rock on the left.", { id: "a3", author: MEMBER, privateChannel: true }));
    await service.handleMessage(message("How do I get water early on?", { id: "q4", author: OWNER }));
    await service.handleMessage(message("idk", { id: "a4", author: MEMBER }));
    expect(storage.learnedRows).toHaveLength(1);

    await service.setOptOut(GUILD, MEMBER, true);
    expect(storage.learnedRows).toHaveLength(0);
    await service.handleMessage(message("What's the best early weapon?", { id: "q5", author: OWNER }));
    await service.handleMessage(message("The Maula pistol is great early because ammo is cheap.", { id: "a5", author: MEMBER }));
    expect(storage.learnedRows).toHaveLength(0);
  });

  it("answers a question by itself when it knows, but steps back if someone else replies first", async () => {
    vi.useFakeTimers();
    try {
      const storage = memoryStorage();
      const service = new ChatbotService(fakeClient(), config({ autoReply: true, autoDelaySeconds: 10, autoCooldownSeconds: 0 }), storage, log);
      const asked = message("Is Crimson Skies PvP or PvE?", { id: "q6", author: MEMBER });
      await service.handleMessage(asked);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(asked.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("PvE-focused"), allowedMentions: { parse: [], repliedUser: false } }));

      const again = message("Is crimson skies pvp or pve?", { id: "q7", author: OWNER, channelId: "910000000000000009" });
      await service.handleMessage(again);
      await service.handleMessage(message("It's PvE, no fighting other players here.", { id: "a7", author: MEMBER, channelId: "910000000000000009" }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(again.reply).not.toHaveBeenCalled();

      const unknown = message("Does anyone want to go to the deep desert tonight?", { id: "q8", author: MEMBER, channelId: "920000000000000009" });
      await service.handleMessage(unknown);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(unknown.reply).not.toHaveBeenCalled();
      service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers its mood and how it feels about members across restarts", async () => {
    const storage = memoryStorage();
    const service = new ChatbotService(fakeClient(), config({ access: "everyone", cooldownSeconds: 0 }), storage, log, () => 1_000);
    const before = (await service.describeMood(GUILD)).score;
    await service.answer({ guildId: GUILD, channelId: CHANNEL, text: "good bot", seed: "x", userId: MEMBER, displayName: "M", serverName: "S", isStaff: false });
    const restarted = new ChatbotService(fakeClient(), config(), storage, log, () => 1_000);
    expect((await restarted.describeMood(GUILD)).score).toBeGreaterThan(before);
    expect(await storage.rapport(GUILD, MEMBER)).toBeGreaterThan(0);
  });
});
