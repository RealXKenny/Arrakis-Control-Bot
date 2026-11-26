import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageArchiveRepository, type MessageArchiveInput } from "../../../../src/infrastructure/database/messages/MessageArchiveRepository";

const query = vi.fn();
const repository = new MessageArchiveRepository({ query } as never);
const message: MessageArchiveInput = {
  messageId: "message", guildId: "guild", channelId: "channel", authorId: "user", authorTag: "User#0001",
  content: "hello", metadata: { attachments: [], embeds: [], components: [], stickers: [], reference: null },
  messageType: 0, flags: "0", isBot: false, webhookId: null,
  createdAt: new Date("2026-09-20T12:00:00Z"), editedAt: null,
};

describe("MessageArchiveRepository", () => {
  beforeEach(() => query.mockReset());

  it("creates message, revision, and deletion indexes", async () => {
    query.mockResolvedValue({ rows: [] });
    await repository.initialize();
    expect(query.mock.calls[0]?.[0]).toContain("bot_discord_messages");
    expect(query.mock.calls[0]?.[0]).toContain("bot_discord_message_edits");
    expect(query.mock.calls[0]?.[0]).toContain("bot_discord_messages_deleted");
  });

  it("upserts every received message", async () => {
    query.mockResolvedValue({ rows: [] });
    await repository.save(message);
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (message_id) DO UPDATE");
    expect(query.mock.calls[0]?.[1]).toHaveLength(13);
  });

  it("records before and after values for edits", async () => {
    query.mockResolvedValue({ rows: [{
      message_id: "message", guild_id: "guild", channel_id: "channel", author_id: "user", author_tag: "User#0001",
      content: "hello", metadata: message.metadata, message_type: 0, flags: "0", is_bot: false, webhook_id: null,
      created_at: message.createdAt, edited_at: null, deleted_at: null,
    }] });
    await expect(repository.recordEdit(message, { ...message, content: "hello there", editedAt: new Date() })).resolves.toMatchObject({ content: "hello" });
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO bot_discord_message_edits");
    expect(query.mock.calls[0]?.[1]).toHaveLength(15);
  });

  it("marks a message deleted without removing its archived content", async () => {
    query.mockResolvedValue({ rows: [{
      message_id: "message", guild_id: "guild", channel_id: "channel", author_id: "user", author_tag: "User#0001",
      content: "hello", metadata: message.metadata, message_type: 0, flags: "0", is_bot: false, webhook_id: null,
      created_at: message.createdAt, edited_at: null, deleted_at: new Date(),
    }] });
    await expect(repository.markDeleted(message)).resolves.toMatchObject({ content: "hello", deletedAt: expect.any(Date) });
    expect(query.mock.calls[0]?.[0]).toContain("deleted_at=COALESCE");
  });

  it("adds time indexes concurrently so a large archive stays writable", async () => {
    query.mockResolvedValue({ rows: [] });
    await repository.initialize();
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining([
      expect.stringContaining("CREATE INDEX CONCURRENTLY IF NOT EXISTS bot_discord_messages_created"),
      expect.stringContaining("CREATE INDEX CONCURRENTLY IF NOT EXISTS bot_discord_message_edits_time"),
    ]));
  });

  it("batches buffered messages into multi-row inserts, keeping the latest copy of each message", async () => {
    query.mockResolvedValue({ rows: [] });
    const batched = new MessageArchiveRepository({ query } as never, { batchSize: 10 });
    batched.enqueue(message);
    batched.enqueue({ ...message, content: "edited before flush" });
    batched.enqueue({ ...message, messageId: "second" });
    await batched.flush();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toHaveLength(26);
    expect(query.mock.calls[0]?.[1]).toContain("edited before flush");
    expect(String(query.mock.calls[0]?.[0])).not.toContain("deleted_at=NULL");
  });

  it("drops new messages when the buffer is full and keeps failed batches for retry", async () => {
    const batched = new MessageArchiveRepository({ query } as never, { batchSize: 10, maxBuffered: 2 });
    expect(batched.enqueue(message)).toBe(true);
    expect(batched.enqueue({ ...message, messageId: "second" })).toBe(true);
    expect(batched.enqueue({ ...message, messageId: "third" })).toBe(false);
    expect(batched.takeDroppedCount()).toBe(1);
    query.mockRejectedValueOnce(new Error("offline"));
    await expect(batched.flush()).rejects.toThrow("offline");
    expect(batched.bufferedCount).toBe(2);
    query.mockResolvedValue({ rows: [] });
    await batched.stop();
    expect(batched.bufferedCount).toBe(0);
  });

  it("writes the buffered original before recording a delete, so it is never undeleted later", async () => {
    query.mockResolvedValue({ rows: [{ message_id: "message", guild_id: "guild", channel_id: "channel", author_id: "user", author_tag: "User#0001",
      content: "hello", metadata: {}, message_type: 0, flags: "0", is_bot: false, webhook_id: null, created_at: new Date(), edited_at: null, deleted_at: new Date() }] });
    const batched = new MessageArchiveRepository({ query } as never);
    batched.enqueue(message);
    await batched.markDeleted(message);
    expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO bot_discord_messages");
    expect(String(query.mock.calls[1]?.[0])).toContain("deleted_at");
    expect(batched.bufferedCount).toBe(0);
  });

  it("purges old messages and edits in bounded batches and validates the retention period", async () => {
    query.mockResolvedValueOnce({ rowCount: 5_000 }).mockResolvedValueOnce({ rowCount: 12 }).mockResolvedValueOnce({ rowCount: 3 });
    expect(await repository.purgeOlderThan(90)).toBe(5_015);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]?.[1]).toEqual([90, 5_000]);
    await expect(repository.purgeOlderThan(0)).rejects.toThrow("positive number of days");
  });
});
