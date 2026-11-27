import { PermissionFlagsBits, PermissionsBitField, type Client, type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatbotConfig } from "../../../../src/infrastructure/config/chatbot";
import type { ChatbotStorage, TaughtAnswer } from "../../../../src/infrastructure/database/chatbot/ChatbotRepository";
import { ChatbotService } from "../../../../src/modules/community/chatbot/ChatbotService";

const BOT = "100000000000000001";
const GUILD = "500000000000000005";
const OWNER = "600000000000000006";
const MEMBER = "300000000000000003";
const STAFF_ROLE = "700000000000000007";
const FRIEND_ROLE = "800000000000000008";
const CHANNEL = "900000000000000009";

const config = (overrides: Partial<ChatbotConfig> = {}): ChatbotConfig => ({ access: "staff", roleIds: [], channelIds: [], cooldownSeconds: 3, ...overrides });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function memoryStorage(): ChatbotStorage & { rows: TaughtAnswer[] } {
  const rows: TaughtAnswer[] = [];
  let next = 1;
  return {
    rows,
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

function message(content: string, options: { roles?: string[]; author?: string; reply?: { authorId: string; id: string; plain?: boolean }; channelId?: string; manageGuild?: boolean } = {}): Message & { reply: ReturnType<typeof vi.fn> } {
  const roles = options.roles ?? [];
  const sent = { id: `sent-${Math.random()}` };
  const referenced = options.reply ? { author: { id: options.reply.authorId }, reference: options.reply.plain === false ? null : { messageId: "x" }, components: [], embeds: [], content: "hi" } : null;
  return {
    id: `m-${content}`,
    content,
    author: { id: options.author ?? MEMBER, bot: false, displayName: "Member" },
    webhookId: null,
    system: false,
    inGuild: () => true,
    guildId: GUILD,
    guild: { ownerId: OWNER, name: "Crimson Skies" },
    channelId: options.channelId ?? CHANNEL,
    channel: { isThread: () => false, sendTyping: vi.fn(() => Promise.resolve()) },
    member: { displayName: "Member", roles: { cache: new Map(roles.map((role) => [role, {}])) }, permissions: new PermissionsBitField(options.manageGuild ? PermissionFlagsBits.ManageGuild : 0n) },
    reference: options.reply ? { messageId: options.reply.id } : null,
    mentions: { repliedUser: options.reply ? { id: options.reply.authorId } : null },
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
});
