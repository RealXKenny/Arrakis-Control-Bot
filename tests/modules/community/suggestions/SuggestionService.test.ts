import { ChannelType, DiscordAPIError } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { SuggestionConfig } from "../../../../src/infrastructure/config/suggestions";
import type { SuggestionFeature, SuggestionPost, SuggestionStorage } from "../../../../src/infrastructure/database/suggestions/SuggestionRepository";
import { SuggestionError, SuggestionService } from "../../../../src/modules/community/suggestions/SuggestionService";
import type { WorkItem } from "../../../../src/modules/community/suggestions/githubActivity";

const GUILD = "100000000000000001";
const FORUM = "100000000000000002";
const AUTHOR = "100000000000000003";
const STAFF = "100000000000000004";
const STAFF_CHANNEL = "100000000000000005";

const config: SuggestionConfig = { guildId: GUILD, forumChannelId: FORUM, autoTag: true, panel: true, notifyAuthor: true, createMissingTags: true, duplicateThreshold: 0.2, autoSummaryMessages: 3, backfillLimit: 50,
  catchUp: false, lockAdded: false, staffChannelId: null, autopilot: true, githubRepos: ["RealXKenny/Arrakis-Control-Bot"], githubIntervalMinutes: 15, autopilotThreshold: 0.2 };

function createForum(names = ["Idea", "Game", "Server", "Under Review", "Planned", "In Progress", "Back Burner", "Not Doing", "Implemented"]) {
  return {
    id: FORUM,
    type: ChannelType.GuildForum,
    availableTags: names.map((name) => ({ id: `tag-${name.toLowerCase().replace(/\s/g, "-")}`, name, moderated: false, emoji: null })),
    setAvailableTags: vi.fn().mockResolvedValue(undefined),
    threads: { fetchActive: vi.fn().mockResolvedValue({ threads: new Map() }), fetchArchived: vi.fn().mockResolvedValue({ threads: new Map(), hasMore: false }) },
  };
}

function createThread(forum: ReturnType<typeof createForum>, id: string, name: string, body: string, appliedTags: string[] = []) {
  const sent: { content?: string; allowedMentions?: unknown; components?: unknown[] }[] = [];
  const thread = {
    id, name, guildId: GUILD, parentId: FORUM, parent: forum, ownerId: AUTHOR, createdAt: new Date("2026-11-01T00:00:00Z"), archived: false, locked: false, messageCount: 0,
    appliedTags: [...appliedTags],
    isThread: () => true,
    fetchStarterMessage: vi.fn().mockResolvedValue({ content: body, author: { id: AUTHOR } }),
    setAppliedTags: vi.fn((tags: string[]) => { thread.appliedTags = [...tags]; return Promise.resolve(); }),
    edit: vi.fn((options: { appliedTags?: string[]; locked?: boolean; archived?: boolean }) => {
      if (options.appliedTags) thread.appliedTags = [...options.appliedTags];
      if (options.locked !== undefined) thread.locked = options.locked;
      if (options.archived !== undefined) thread.archived = options.archived;
      return Promise.resolve();
    }),
    setArchived: vi.fn().mockResolvedValue(undefined),
    send: vi.fn((payload: (typeof sent)[number]) => { sent.push(payload); return Promise.resolve({ id: `msg-${sent.length}` }); }),
    messages: { fetch: vi.fn() },
    sent,
  };
  thread.messages.fetch.mockImplementation((options: { message?: string }) => options.message
    ? Promise.resolve({ edit: vi.fn().mockResolvedValue(undefined) })
    : Promise.resolve(new Map([["m1", { id: "m1", author: { id: "100000000000000009", bot: false }, system: false, content: "+1 love this", createdAt: new Date() }]])));
  return thread;
}

function createStorage(): SuggestionStorage & { saved: Map<string, SuggestionPost> } {
  const saved = new Map<string, SuggestionPost>();
  const feature: SuggestionFeature = { id: "9", guildId: GUILD, name: "Heat toggle", keywords: "", referenceUrl: null, status: "in_progress", createdBy: STAFF, createdAt: new Date(), implementedAt: null, linkedCount: 0 };
  return {
    saved,
    initialize: vi.fn().mockResolvedValue(undefined),
    listPosts: vi.fn().mockResolvedValue([]),
    upsertPost: vi.fn((post: SuggestionPost) => { saved.set(post.threadId, { ...post }); return Promise.resolve(); }),
    updatePostTags: vi.fn().mockResolvedValue(undefined),
    updatePanelMessage: vi.fn().mockResolvedValue(undefined),
    updateStaffMessage: vi.fn().mockResolvedValue(undefined),
    markClosed: vi.fn().mockResolvedValue(undefined),
    deletePost: vi.fn().mockResolvedValue(undefined),
    createFeature: vi.fn().mockResolvedValue(feature),
    feature: vi.fn().mockResolvedValue(feature),
    listFeatures: vi.fn().mockResolvedValue([feature]),
    linkThreads: vi.fn().mockResolvedValue(undefined),
    linkedThreadIds: vi.fn().mockResolvedValue([]),
    featureForThread: vi.fn().mockResolvedValue(null),
    markImplemented: vi.fn().mockResolvedValue({ ...feature, status: "implemented" }),
    workLinkStatus: vi.fn().mockResolvedValue(null),
    saveWorkLink: vi.fn().mockResolvedValue(undefined),
    workLinks: vi.fn().mockResolvedValue([]),
    unshippedThreadIds: vi.fn().mockResolvedValue([]),
  };
}

function createStaffChannel() {
  const sent: { components?: unknown[]; allowedMentions?: unknown }[] = [];
  const edits: { components?: unknown[] }[] = [];
  return {
    id: STAFF_CHANNEL, sent, edits,
    isSendable: () => true, isDMBased: () => false, isThread: () => false,
    send: vi.fn((payload: (typeof sent)[number]) => { sent.push(payload); return Promise.resolve({ id: `staff-${sent.length}` }); }),
    messages: {
      fetch: vi.fn(() => Promise.resolve({ edit: vi.fn((payload: (typeof edits)[number]) => { edits.push(payload); return Promise.resolve(); }) })),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createService(forum = createForum(), threads: Record<string, unknown> = {}, overrides: Partial<SuggestionConfig> = {}) {
  const storage = createStorage();
  const client = { user: { id: "100000000000000099" }, channels: { cache: new Map([[FORUM, forum]]), fetch: vi.fn((id: string) => Promise.resolve(id === FORUM ? forum : threads[id] ?? null)) } };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new SuggestionService(client as never, { ...config, ...overrides }, storage, logger, () => Promise.resolve());
  return { service, storage, logger, client };
}

describe("SuggestionService", () => {
  it("tags a new post, sets Under Review and posts the assistant panel", async () => {
    const forum = createForum();
    const { service, storage } = createService(forum);
    const thread = createThread(forum, "200000000000000001", "Server restart schedule", "Please restart the server every night to fix lag");
    await service.handleThreadCreate(thread as never, true);
    expect(thread.appliedTags).toEqual(expect.arrayContaining(["tag-server", "tag-under-review"]));
    expect(thread.sent).toHaveLength(1);
    expect(thread.sent[0]?.allowedMentions).toEqual({ parse: [] });
    expect(JSON.stringify(thread.sent[0]?.components)).toContain("suggestion-status:planned");
    expect(storage.saved.get(thread.id)?.panelMessageId).toBe("msg-1");
  });

  it("keeps the author's own category tags", async () => {
    const forum = createForum();
    const { service } = createService(forum);
    const thread = createThread(forum, "200000000000000002", "Server restart schedule", "restart the server", ["tag-game"]);
    await service.handleThreadCreate(thread as never, true);
    expect(thread.appliedTags).toEqual(["tag-under-review", "tag-game"]);
  });

  it("ignores threads outside the suggestion forum and replayed creates", async () => {
    const forum = createForum();
    const { service } = createService(forum);
    const other = { ...createThread(forum, "200000000000000003", "x", "y"), parentId: "999" };
    await service.handleThreadCreate(other as never, true);
    const replay = createThread(forum, "200000000000000004", "x", "y");
    await service.handleThreadCreate(replay as never, false);
    expect(other.sent).toHaveLength(0);
    expect(replay.sent).toHaveLength(0);
  });

  it("finds a duplicate of an earlier post", async () => {
    const forum = createForum();
    const { service } = createService(forum);
    const first = createThread(forum, "200000000000000005", "Desert heat", "Turn desert heat on for roleplay");
    await service.handleThreadCreate(first as never, true);
    const second = createThread(forum, "200000000000000006", "Enable desert heat", "Desert heat would make roleplay better");
    await service.handleThreadCreate(second as never, true);
    expect(service.related(second.id).map((post) => post.threadId)).toContain(first.id);
  });

  it("changes status, pings only the suggester and refreshes the panel", async () => {
    const forum = createForum();
    const { service } = createService(forum);
    const thread = createThread(forum, "200000000000000007", "Desert heat", "Turn on desert heat");
    await service.handleThreadCreate(thread as never, true);
    await service.setStatus(thread as never, "in_progress", { actorId: STAFF, note: "Starting this week" });
    expect(thread.appliedTags[0]).toBe("tag-in-progress");
    expect(thread.appliedTags).not.toContain("tag-under-review");
    const notice = thread.sent.at(-1);
    expect(notice?.allowedMentions).toEqual({ parse: [], users: [AUTHOR] });
    expect(notice?.content).toContain("Starting this week");
  });

  it("refuses a status the forum has no tag for", async () => {
    const forum = createForum(["Idea", "Under Review"]);
    const { service } = createService(forum);
    const thread = createThread(forum, "200000000000000008", "x", "y");
    await expect(service.setStatus(thread as never, "planned", { actorId: STAFF })).rejects.toBeInstanceOf(SuggestionError);
  });

  it("re-posts the panel only when the old one was deleted", async () => {
    const forum = createForum();
    const { service, storage } = createService(forum);
    const thread = createThread(forum, "200000000000000009", "Desert heat", "Turn on desert heat");
    await service.handleThreadCreate(thread as never, true);
    thread.messages.fetch.mockRejectedValueOnce(new DiscordAPIError({ code: 10008, message: "Unknown Message" }, 10008, 404, "GET", "/x", {}));
    await service.ensurePanel(thread as never, STAFF);
    expect(thread.sent).toHaveLength(2);
    expect(storage.updatePanelMessage).toHaveBeenCalledWith(thread.id, "msg-2");
    thread.messages.fetch.mockRejectedValueOnce(new Error("Missing Access"));
    await expect(service.ensurePanel(thread as never, STAFF)).rejects.toThrow("Missing Access");
    expect(thread.sent).toHaveLength(2);
  });

  it("creates missing status tags as staff-only tags", async () => {
    const forum = createForum(["Idea", "Under Review", "In Progress", "Implemented"]);
    const { service } = createService(forum);
    await expect(service.ensureStatusTags(forum as never)).resolves.toEqual(["Planned", "Back Burner", "Not Doing"]);
    const tags = forum.setAvailableTags.mock.calls[0]?.[0] as { name: string; moderated?: boolean }[];
    expect(tags.filter((tag) => tag.moderated).map((tag) => tag.name)).toEqual(["Planned", "Back Burner", "Not Doing"]);
  });

  it("links a feature's suggestions and ships them", async () => {
    const forum = createForum();
    const thread = createThread(forum, "200000000000000010", "Desert heat toggle", "Turn on desert heat");
    const { service, storage } = createService(forum, { [thread.id]: thread });
    await service.handleThreadCreate(thread as never, true);
    const { candidates } = await service.startFeature(GUILD, "Desert heat", "heat", null, STAFF);
    expect(candidates[0]).toMatchObject({ threadId: thread.id, selected: true });
    const linked = await service.linkThreads(GUILD, "9", [thread.id, "200000000000000099"], STAFF);
    expect(linked.outcomes).toEqual([{ threadId: thread.id, ok: true }, { threadId: "200000000000000099", ok: false, detail: "not a suggestion post" }]);
    expect(storage.linkThreads).toHaveBeenCalledWith("9", [thread.id], STAFF);
    vi.mocked(storage.linkedThreadIds).mockResolvedValue([thread.id]);
    const shipped = await service.shipFeature(GUILD, "9", "https://example.com/release", "Thanks all", STAFF);
    expect(shipped.outcomes).toEqual([{ threadId: thread.id, ok: true }]);
    expect(thread.appliedTags[0]).toBe("tag-implemented");
  });

  it("posts an automatic summary only after crossing a new reply threshold", async () => {
    const forum = createForum();
    const { service } = createService(forum);
    const thread = createThread(forum, "200000000000000011", "Desert heat", "x");
    thread.messages.fetch.mockResolvedValue(new Map([
      ["a", { id: "a", author: { id: "1", bot: false }, system: false, content: "Desert heat makes water management matter a lot more.", createdAt: new Date(1) }],
      ["b", { id: "b", author: { id: "2", bot: false }, system: false, content: "Desert heat and water management would slow new players.", createdAt: new Date(2) }],
    ]));
    const message = (count: number) => { thread.messageCount = count; return { author: { bot: false }, webhookId: null, channel: thread, mentions: { users: new Map(), repliedUser: null } } as never; };
    await service.handleMessage(message(4));
    expect(thread.sent).toHaveLength(0);
    await service.handleMessage(message(5));
    expect(thread.sent).toHaveLength(0);
    await service.handleMessage(message(6));
    expect(thread.sent).toHaveLength(1);
    await service.handleMessage(message(7));
    expect(thread.sent).toHaveLength(1);
  });

  describe("GitHub autopilot", () => {
    const work = (overrides: Partial<WorkItem> = {}): WorkItem => ({
      key: "pull:o/r:5", repo: "o/r", kind: "pull", title: "Desert heat toggle for roleplay", text: "Desert heat toggle for roleplay", url: "https://github.com/o/r/pull/5",
      status: "in_progress", at: new Date("2026-11-10T00:00:00Z"), mergedAt: null, ongoing: true, ...overrides,
    });

    async function ready(applied: string[] = []) {
      const forum = createForum();
      const thread = createThread(forum, "200000000000000020", "Desert heat toggle", "Turn on desert heat for roleplay", applied);
      const context = createService(forum, { [thread.id]: thread });
      await context.service.handleThreadCreate(thread as never, true);
      return { ...context, thread };
    }

    it("matches GitHub work by wording or by a direct link", async () => {
      const { service, thread } = await ready();
      expect(service.matchWork(work(), 0.2)).toEqual([{ threadId: thread.id, explicit: false }]);
      expect(service.matchWork(work({ text: "heat" }), 0.2)).toEqual([]);
      expect(service.matchWork(work({ text: `Closes https://discord.com/channels/${GUILD}/${thread.id}` }), 0.2)).toEqual([{ threadId: thread.id, explicit: true }]);
    });

    it("moves a suggestion forward with a GitHub link and pings only the suggester", async () => {
      const { service, storage, thread } = await ready();
      await expect(service.applyWork(thread.id, work(), false)).resolves.toBe("moved");
      expect(thread.appliedTags[0]).toBe("tag-in-progress");
      const notice = thread.sent.at(-1);
      expect(notice?.allowedMentions).toEqual({ parse: [], users: [AUTHOR] });
      expect(notice?.content).toContain("(<https://github.com/o/r/pull/5>)");
      expect(storage.saveWorkLink).toHaveBeenCalledWith(expect.objectContaining({ threadId: thread.id, itemKey: "pull:o/r:5", status: "in_progress" }));
    });

    it("acts on each link once and never overrides a staff decision", async () => {
      const { service, storage, thread } = await ready();
      vi.mocked(storage.workLinkStatus).mockResolvedValueOnce("in_progress");
      await expect(service.applyWork(thread.id, work(), false)).resolves.toBe("skipped");
      await service.setStatus(thread as never, "not_doing", { actorId: STAFF });
      const sent = thread.sent.length;
      await expect(service.applyWork(thread.id, work({ key: "release:o/r:v2:0", kind: "release", status: "implemented", ongoing: false, at: new Date("2026-12-01T00:00:00Z") }), false)).resolves.toBe("linked");
      expect(thread.appliedTags[0]).toBe("tag-not-doing");
      expect(thread.sent).toHaveLength(sent);
    });

    it("ignores finished work from before the suggestion was posted", async () => {
      const { service, thread } = await ready();
      await expect(service.applyWork(thread.id, work({ ongoing: false, at: new Date("2026-10-01T00:00:00Z") }), false)).resolves.toBe("skipped");
      await expect(service.applyWork(thread.id, work({ ongoing: false, at: new Date("2026-10-01T00:00:00Z") }), true)).resolves.toBe("moved");
    });
  });

  it("catches up older posts with tags and a panel without pinging anyone", async () => {
    const forum = createForum();
    const thread = createThread(forum, "200000000000000030", "Server restart schedule", "Please restart the server every night to fix lag");
    thread.archived = true;
    forum.threads.fetchActive.mockResolvedValue({ threads: new Map([[thread.id, thread]]) });
    const { service, storage } = createService(forum, { [thread.id]: thread });
    await (service as unknown as { prepareForum(): Promise<boolean> }).prepareForum();
    await expect(service.catchUp()).resolves.toBe(1);
    expect(thread.appliedTags).toEqual(expect.arrayContaining(["tag-server", "tag-under-review"]));
    expect(thread.sent).toHaveLength(1);
    expect(thread.sent[0]?.allowedMentions).toEqual({ parse: [] });
    expect(thread.setArchived).toHaveBeenLastCalledWith(true, expect.any(String));
    expect(storage.updatePanelMessage).toHaveBeenCalledWith(thread.id, "msg-1");
    await expect(service.catchUp()).resolves.toBe(0);
  });

  describe("conversation", () => {
    const BOT = "100000000000000099";
    function ask(thread: ReturnType<typeof createThread>, content: string, author = "100000000000000007") {
      const reply = vi.fn().mockResolvedValue(undefined);
      return { reply, message: { reply, id: `m-${content.length}`, content, author: { id: author, bot: false }, webhookId: null, channel: thread, mentions: { users: new Map([[BOT, {}]]), repliedUser: null } } };
    }

    it("answers a status question with the current status and linked GitHub work, pinging only the asker", async () => {
      const forum = createForum();
      const { service, storage } = createService(forum);
      const thread = createThread(forum, "200000000000000040", "Desert heat toggle", "Turn on desert heat for roleplay", ["tag-in-progress"]);
      vi.mocked(storage.workLinks).mockResolvedValue([{ threadId: thread.id, itemKey: "pull:o/r:5", repo: "o/r", kind: "pull", title: "Heat toggle", url: "https://github.com/o/r/pull/5", status: "in_progress", at: new Date(), mergedAt: null }]);
      const { message, reply } = ask(thread, `<@${BOT}> any update on this?`);
      await service.handleMessage(message as never);
      const payload = reply.mock.calls[0]?.[0] as { content: string; allowedMentions: unknown };
      expect(payload.content).toContain("🔨");
      expect(payload.content).toContain("(<https://github.com/o/r/pull/5>)");
      expect(payload.allowedMentions).toEqual({ parse: [], users: ["100000000000000007"], repliedUser: false });
    });

    it("ignores messages not meant for it and rate-limits each member", async () => {
      const forum = createForum();
      const { service } = createService(forum);
      const thread = createThread(forum, "200000000000000041", "Desert heat toggle", "Turn on desert heat");
      const plain = ask(thread, "any update?");
      plain.message.mentions.users = new Map();
      await service.handleMessage(plain.message as never);
      expect(plain.reply).not.toHaveBeenCalled();
      const first = ask(thread, `<@${BOT}> thanks!`);
      const second = ask(thread, `<@${BOT}> hello again`);
      await service.handleMessage(first.message as never);
      await service.handleMessage(second.message as never);
      expect(first.reply).toHaveBeenCalledTimes(1);
      expect(second.reply).not.toHaveBeenCalled();
    });
  });
  describe("closing added suggestions", () => {
    it("locks the post with a note when it is marked Added", async () => {
      const forum = createForum();
      const { service, storage } = createService(forum, {}, { lockAdded: true });
      const thread = createThread(forum, "200000000000000201", "Heat toggle", "Turn the desert heat on");
      await service.handleThreadCreate(thread as never, true);
      await service.setStatus(thread as never, "implemented", { actorId: STAFF });
      expect(thread.sent.at(-1)?.content).toContain("this post is now locked");
      expect(thread.edit).toHaveBeenLastCalledWith(expect.objectContaining({ locked: true, archived: true }));
      expect(thread.locked).toBe(true);
      expect(storage.markClosed).toHaveBeenCalledWith(thread.id, expect.any(Date));
    });

    it("leaves Added posts open when locking is off", async () => {
      const forum = createForum();
      const { service } = createService(forum);
      const thread = createThread(forum, "200000000000000202", "Heat toggle", "Turn the desert heat on");
      await service.handleThreadCreate(thread as never, true);
      await service.setStatus(thread as never, "implemented", { actorId: STAFF });
      expect(thread.locked).toBe(false);
      expect(thread.sent.some((message) => message.content?.includes("now locked"))).toBe(false);
    });

    it("reopens a post it locked when staff move it back, but never one staff locked", async () => {
      const forum = createForum();
      const { service, storage } = createService(forum, {}, { lockAdded: true });
      const thread = createThread(forum, "200000000000000203", "Heat toggle", "Turn the desert heat on");
      await service.handleThreadCreate(thread as never, true);
      await service.setStatus(thread as never, "implemented", { actorId: STAFF });
      await service.setStatus(thread as never, "in_progress", { actorId: STAFF });
      expect(thread.locked).toBe(false);
      expect(storage.markClosed).toHaveBeenLastCalledWith(thread.id, null);

      const manual = createThread(forum, "200000000000000204", "Night cycle", "Longer nights");
      await service.handleThreadCreate(manual as never, true);
      manual.locked = true;
      await service.setStatus(manual as never, "planned", { actorId: STAFF });
      expect(manual.locked).toBe(true);
    });

    it("locks a post staff tag as Added by hand", async () => {
      const forum = createForum();
      const { service } = createService(forum, {}, { lockAdded: true });
      const thread = createThread(forum, "200000000000000205", "Heat toggle", "Turn the desert heat on");
      await service.handleThreadCreate(thread as never, true);
      thread.appliedTags = ["tag-implemented"];
      await service.handleThreadUpdate(thread as never);
      expect(thread.sent.at(-1)?.content).toContain("now locked");
      expect(thread.locked).toBe(true);
      // The lock itself fires another update; nothing is posted twice.
      await service.handleThreadUpdate(thread as never);
      expect(thread.sent.filter((message) => message.content?.includes("now locked"))).toHaveLength(1);
    });

    it("closes older Added posts once at startup and respects staff locks", async () => {
      const forum = createForum();
      const added = createThread(forum, "200000000000000206", "Heat toggle", "x", ["tag-implemented"]);
      const lockedByStaff = createThread(forum, "200000000000000207", "Night cycle", "y", ["tag-implemented"]);
      lockedByStaff.locked = true;
      const open = createThread(forum, "200000000000000208", "Maps", "z", ["tag-planned"]);
      const { service, storage } = createService(forum, { [added.id]: added, [lockedByStaff.id]: lockedByStaff, [open.id]: open }, { lockAdded: true });
      vi.mocked(storage.listPosts).mockResolvedValue([added, lockedByStaff, open].map((thread) => ({
        threadId: thread.id, guildId: GUILD, forumId: FORUM, authorId: AUTHOR, title: thread.name, body: "", tagIds: [...thread.appliedTags], panelMessageId: "p", createdAt: new Date(),
      })));
      await service.initialize();
      expect(await service.closeAddedPosts()).toBe(1);
      expect(added.sent.at(-1)?.content).toContain("now locked");
      expect(added.locked).toBe(true);
      expect(lockedByStaff.sent).toHaveLength(0);
      expect(storage.markClosed).toHaveBeenCalledWith(lockedByStaff.id, expect.any(Date));
      expect(open.sent).toHaveLength(0);
      expect(await service.closeAddedPosts()).toBe(0);
    });
  });

  describe("staff channel panels", () => {
    function withStaffChannel(forum: ReturnType<typeof createForum>, threads: Record<string, unknown> = {}) {
      const staff = createStaffChannel();
      const created = createService(forum, { ...threads, [STAFF_CHANNEL]: staff }, { staffChannelId: STAFF_CHANNEL, lockAdded: true });
      return { ...created, staff };
    }

    it("posts a status panel for each new suggestion without pinging anyone", async () => {
      const forum = createForum();
      const { service, storage, staff } = withStaffChannel(forum);
      const thread = createThread(forum, "200000000000000301", "Heat toggle", "Turn the desert heat on");
      await service.handleThreadCreate(thread as never, true);
      expect(staff.sent).toHaveLength(1);
      expect(staff.sent[0]?.allowedMentions).toEqual({ parse: [] });
      const json = JSON.stringify(staff.sent[0]?.components);
      expect(json).toContain(`suggestion-staff:planned:${thread.id}`);
      expect(json).toContain("Heat toggle");
      expect(storage.updateStaffMessage).toHaveBeenCalledWith(thread.id, "staff-1");
    });

    it("updates the staff panel when the status changes", async () => {
      const forum = createForum();
      const { service, staff } = withStaffChannel(forum);
      const thread = createThread(forum, "200000000000000302", "Heat toggle", "Turn the desert heat on");
      await service.handleThreadCreate(thread as never, true);
      await service.setStatus(thread as never, "implemented", { actorId: STAFF });
      expect(staff.sent).toHaveLength(1);
      const json = JSON.stringify(staff.edits.at(-1)?.components);
      expect(json).toContain("locked");
      expect(json).toContain(`<@${STAFF}>`);
    });

    it("catches up older suggestions and removes the panel when a post is deleted", async () => {
      const forum = createForum();
      const { service, storage, staff } = withStaffChannel(forum);
      vi.mocked(storage.listPosts).mockResolvedValue([
        { threadId: "200000000000000303", guildId: GUILD, forumId: FORUM, authorId: AUTHOR, title: "Newer", body: "", tagIds: [], panelMessageId: "p", createdAt: new Date("2026-11-02T00:00:00Z") },
        { threadId: "200000000000000304", guildId: GUILD, forumId: FORUM, authorId: AUTHOR, title: "Older", body: "", tagIds: [], panelMessageId: "p", createdAt: new Date("2026-11-01T00:00:00Z") },
      ]);
      await service.initialize();
      expect(await service.catchUpStaffPanels()).toBe(2);
      expect(JSON.stringify(staff.sent[0]?.components)).toContain("Older");
      expect(await service.catchUpStaffPanels()).toBe(0);
      const thread = createThread(forum, "200000000000000303", "Newer", "");
      await service.handleThreadDelete(thread as never);
      expect(staff.messages.delete).toHaveBeenCalledWith("staff-2");
    });
  });
});
