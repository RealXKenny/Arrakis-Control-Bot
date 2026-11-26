import { ChannelType, DiscordAPIError } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { SuggestionConfig } from "../../../../src/infrastructure/config/suggestions";
import type { SuggestionFeature, SuggestionPost, SuggestionStorage } from "../../../../src/infrastructure/database/suggestions/SuggestionRepository";
import { SuggestionError, SuggestionService } from "../../../../src/modules/community/suggestions/SuggestionService";

const GUILD = "100000000000000001";
const FORUM = "100000000000000002";
const AUTHOR = "100000000000000003";
const STAFF = "100000000000000004";

const config: SuggestionConfig = { guildId: GUILD, forumChannelId: FORUM, autoTag: true, panel: true, notifyAuthor: true, createMissingTags: true, duplicateThreshold: 0.2, autoSummaryMessages: 3, backfillLimit: 50 };

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
    id, name, guildId: GUILD, parentId: FORUM, parent: forum, ownerId: AUTHOR, createdAt: new Date("2026-11-01T00:00:00Z"), archived: false, messageCount: 0,
    appliedTags: [...appliedTags],
    isThread: () => true,
    fetchStarterMessage: vi.fn().mockResolvedValue({ content: body, author: { id: AUTHOR } }),
    setAppliedTags: vi.fn((tags: string[]) => { thread.appliedTags = [...tags]; return Promise.resolve(); }),
    edit: vi.fn((options: { appliedTags?: string[] }) => { if (options.appliedTags) thread.appliedTags = [...options.appliedTags]; return Promise.resolve(); }),
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
    deletePost: vi.fn().mockResolvedValue(undefined),
    createFeature: vi.fn().mockResolvedValue(feature),
    feature: vi.fn().mockResolvedValue(feature),
    listFeatures: vi.fn().mockResolvedValue([feature]),
    linkThreads: vi.fn().mockResolvedValue(undefined),
    linkedThreadIds: vi.fn().mockResolvedValue([]),
    featureForThread: vi.fn().mockResolvedValue(null),
    markImplemented: vi.fn().mockResolvedValue({ ...feature, status: "implemented" }),
  };
}

function createService(forum = createForum(), threads: Record<string, unknown> = {}) {
  const storage = createStorage();
  const client = { channels: { cache: new Map([[FORUM, forum]]), fetch: vi.fn((id: string) => Promise.resolve(id === FORUM ? forum : threads[id] ?? null)) } };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new SuggestionService(client as never, config, storage, logger, () => Promise.resolve());
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
    const message = (count: number) => { thread.messageCount = count; return { author: { bot: false }, webhookId: null, channel: thread } as never; };
    await service.handleMessage(message(4));
    expect(thread.sent).toHaveLength(0);
    await service.handleMessage(message(5));
    expect(thread.sent).toHaveLength(0);
    await service.handleMessage(message(6));
    expect(thread.sent).toHaveLength(1);
    await service.handleMessage(message(7));
    expect(thread.sent).toHaveLength(1);
  });
});
