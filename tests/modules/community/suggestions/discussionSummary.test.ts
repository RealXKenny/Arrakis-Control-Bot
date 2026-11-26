import { describe, expect, it } from "vitest";
import { messageStance, summarizeDiscussion } from "../../../../src/modules/community/suggestions/discussionSummary";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 12, minute));

describe("discussion summary", () => {
  it("counts each member's latest stance once", () => {
    const summary = summarizeDiscussion([
      { authorId: "a", content: "+1 great idea", createdAt: at(1) },
      { authorId: "a", content: "Yes, I agree", createdAt: at(2) },
      { authorId: "b", content: "I don't agree, it would ruin PvP", createdAt: at(3) },
      { authorId: "c", content: "No thoughts", createdAt: at(4) },
    ]);
    expect(summary).toMatchObject({ messageCount: 4, participantCount: 3, supportCount: 1, opposeCount: 1 });
  });

  it("detects opposition before support words", () => {
    expect(messageStance("I don't agree with this")).toBe("oppose");
    expect(messageStance("Would be cool")).toBe("support");
    expect(messageStance("What time is the restart?")).toBe("neutral");
  });

  it("picks distinct key points in chronological order and bounds their length", () => {
    const messages = [
      { authorId: "a", content: "Desert heat makes water management matter for roleplay servers.", createdAt: at(1) },
      { authorId: "b", content: "Desert heat with water management would slow new players down a lot.", createdAt: at(2) },
      { authorId: "c", content: `Roleplay servers need lower rates if desert heat is on. ${"long ".repeat(80)}`, createdAt: at(3) },
      { authorId: "d", content: "ok", createdAt: at(4) },
    ];
    const summary = summarizeDiscussion(messages);
    expect(summary.keyPoints.length).toBeGreaterThan(0);
    expect(summary.keyPoints.length).toBeLessThanOrEqual(4);
    for (const point of summary.keyPoints) expect(Array.from(point.text).length).toBeLessThanOrEqual(180);
    expect(summary.topTerms).toContain("desert");
    expect(summary.firstAt).toEqual(at(1));
    expect(summary.lastAt).toEqual(at(4));
  });

  it("handles an empty discussion", () => {
    expect(summarizeDiscussion([])).toMatchObject({ messageCount: 0, participantCount: 0, keyPoints: [], topTerms: [] });
  });
});
