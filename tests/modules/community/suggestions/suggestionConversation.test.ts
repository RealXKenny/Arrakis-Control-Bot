import { describe, expect, it } from "vitest";
import { composeConversationReply, detectIntent, type ConversationContext } from "../../../../src/modules/community/suggestions/suggestionConversation";

const base: ConversationContext = { seed: "s", askerId: "123456789012345678", title: "Spice tracker", work: [], related: [] };

describe("suggestion conversation", () => {
  it("reads what a member is asking", () => {
    expect(detectIntent("<@1> any update on this?")).toBe("status");
    expect(detectIntent("when is this coming out")).toBe("status");
    expect(detectIntent("is this a duplicate?")).toBe("similar");
    expect(detectIntent("tl;dr please")).toBe("summary");
    expect(detectIntent("what do you think about it")).toBe("opinion");
    expect(detectIntent("thanks bot")).toBe("thanks");
    expect(detectIntent("hey")).toBe("greeting");
    expect(detectIntent("<@1>")).toBe("greeting");
    expect(detectIntent("what can you do")).toBe("help");
    expect(detectIntent("purple elephants")).toBe("unknown");
  });

  it("answers from what it knows and never invents a date", () => {
    const planned = composeConversationReply("status", { ...base, status: "planned" });
    expect(planned).toContain("📋");
    expect(planned).toContain("<@123456789012345678>");
    expect(planned).not.toMatch(/\b(tomorrow|next week|in \d+ days?)\b/i);
    expect(composeConversationReply("status", { ...base, status: "implemented" })).toContain("✅");
  });

  it("lists similar posts or says there are none", () => {
    expect(composeConversationReply("similar", { ...base, related: [{ threadId: "200000000000000001", title: "Spice log" }] })).toContain("<#200000000000000001>");
    expect(composeConversationReply("similar", base)).toMatch(/new idea|original/);
  });

  it("recaps the discussion in sentences and stays neutral when asked for an opinion", () => {
    const summary = { messageCount: 9, participantCount: 4, supportCount: 3, opposeCount: 0, keyPoints: [{ authorId: "1", text: "Tracking harvests would help guilds plan." }], topTerms: ["harvest"], topWords: ["harvests"], firstAt: new Date(), lastAt: new Date() };
    const recap = composeConversationReply("summary", { ...base, summary });
    expect(recap).toContain("4 members have written 9 messages");
    expect(recap).toContain("**harvests**");
    expect(recap).toContain("> Tracking harvests");
    expect(composeConversationReply("opinion", { ...base, summary })).toMatch(/3 for and 0 against/);
  });

  it("varies its wording", () => {
    const replies = new Set(Array.from({ length: 20 }, (_, index) => composeConversationReply("status", { ...base, seed: String(index), status: "in_progress" })));
    expect(replies.size).toBeGreaterThan(2);
  });
});
