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
});
