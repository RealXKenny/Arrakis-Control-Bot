import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuggestionRepository } from "../../../../src/infrastructure/database/suggestions/SuggestionRepository";

const query = vi.fn();
const pool = { query };
const featureRow = {
  id: "42", guild_id: "guild", name: "Desert heat", keywords: "heat", reference_url: null, status: "in_progress", created_by: "staff",
  created_at: "2026-11-20T12:00:00Z", implemented_at: null, linked_count: "3",
};

describe("SuggestionRepository", () => {
  beforeEach(() => query.mockReset());

  it("creates its tables idempotently", async () => {
    query.mockResolvedValue({ rows: [] });
    await new SuggestionRepository(pool as never).initialize();
    const sql = String(query.mock.calls[0]?.[0]);
    for (const table of ["suggestion_posts", "suggestion_features", "suggestion_feature_links"]) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(sql).not.toMatch(/DROP|TRUNCATE/i);
  });

  it("maps posts and keeps tag arrays safe", async () => {
    query.mockResolvedValue({ rows: [{ thread_id: "t", guild_id: "g", forum_id: "f", author_id: null, title: "Title", body: "", tag_ids: ["a", 5], panel_message_id: "m", created_at: "2026-11-01T00:00:00Z" }] });
    const [post] = await new SuggestionRepository(pool as never).listPosts("g", "f", 10);
    expect(post).toMatchObject({ threadId: "t", tagIds: ["a"], panelMessageId: "m" });
    expect(post?.createdAt).toBeInstanceOf(Date);
    expect(query.mock.calls[0]?.[1]).toEqual(["g", "f", 10]);
  });

  it("bounds stored post text and keeps an existing panel id", async () => {
    query.mockResolvedValue({ rows: [] });
    await new SuggestionRepository(pool as never).upsertPost({ threadId: "t", guildId: "g", forumId: "f", authorId: "a", title: "x".repeat(300), body: "y".repeat(5_000), tagIds: [], panelMessageId: null, createdAt: new Date() });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("COALESCE(EXCLUDED.panel_message_id, suggestion_posts.panel_message_id)");
    expect(String(params[4])).toHaveLength(200);
    expect(String(params[5])).toHaveLength(4_000);
  });

  it("keeps feature ids as decimal strings and rejects malformed ids without querying", async () => {
    query.mockResolvedValue({ rows: [featureRow] });
    const repository = new SuggestionRepository(pool as never);
    await expect(repository.feature("guild", "42")).resolves.toMatchObject({ id: "42", linkedCount: 3, status: "in_progress" });
    query.mockClear();
    await expect(repository.feature("guild", "42; DROP TABLE x")).resolves.toBeNull();
    await expect(repository.linkedThreadIds("nope")).resolves.toEqual([]);
    await repository.linkThreads("1", [], "staff");
    expect(query).not.toHaveBeenCalled();
  });

  it("escapes LIKE wildcards in feature searches", async () => {
    query.mockResolvedValue({ rows: [] });
    await new SuggestionRepository(pool as never).listFeatures("guild", "100%_done", 25);
    expect(query.mock.calls[0]?.[1]).toEqual(["guild", "100\\%\\_done", 25]);
  });
});
