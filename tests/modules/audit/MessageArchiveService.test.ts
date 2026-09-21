import { Collection, MessageFlagsBitField, type Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { MessageArchiveService, snapshot } from "../../../src/modules/audit/MessageArchiveService";

function fakeMessage(content: string, editedAt: Date | null = null): Message {
  return {
    id: "message", guildId: "guild", channelId: "channel", content, partial: false,
    author: { id: "user", tag: "User#0001", bot: false }, type: 0,
    flags: new MessageFlagsBitField(), webhookId: null,
    createdAt: new Date("2026-09-20T12:00:00Z"), editedAt,
    attachments: new Collection(), embeds: [], components: [], stickers: new Collection(), reference: null,
  } as unknown as Message;
}

describe("MessageArchiveService", () => {
  it("captures stable message context and metadata", () => {
    expect(snapshot(fakeMessage("hello"))).toMatchObject({
      messageId: "message", guildId: "guild", channelId: "channel", authorId: "user", content: "hello",
      metadata: { attachments: [], embeds: [], components: [], stickers: [], reference: null },
    });
  });

  it("logs before and after content only when the repository records a real edit", async () => {
    const before = snapshot(fakeMessage("before"));
    const repository = { initialize: vi.fn(), save: vi.fn(), recordEdit: vi.fn().mockResolvedValue({ ...before, deletedAt: null }), markDeleted: vi.fn() };
    const sendTo = vi.fn().mockResolvedValue(undefined);
    const service = new MessageArchiveService(repository as never, { activityChannelId: "log", sendTo } as never);
    await service.edited(fakeMessage("before"), fakeMessage("after", new Date("2026-09-20T12:01:00Z")));
    expect(sendTo).toHaveBeenCalledWith("log", "Message edited", expect.arrayContaining([expect.stringContaining("Before"), expect.stringContaining("After")]));
    repository.recordEdit.mockResolvedValueOnce(null);
    await service.edited(fakeMessage("after"), fakeMessage("after"));
    expect(sendTo).toHaveBeenCalledOnce();
  });

  it("logs recovered database content when a message is deleted", async () => {
    const archived = { ...snapshot(fakeMessage("saved content")), deletedAt: new Date() };
    const repository = { initialize: vi.fn(), save: vi.fn(), recordEdit: vi.fn(), markDeleted: vi.fn().mockResolvedValue(archived) };
    const sendTo = vi.fn().mockResolvedValue(undefined);
    await new MessageArchiveService(repository as never, { activityChannelId: "log", sendTo } as never).deleted(fakeMessage(""));
    expect(sendTo).toHaveBeenCalledWith("log", "Message deleted", expect.arrayContaining([expect.stringContaining("saved content")]));
  });
});
