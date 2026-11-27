import { describe, expect, it } from "vitest";
import { isQuestion, learnableAnswer, learnableQuestion } from "../../../../src/modules/community/chatbot/chatbotLearning";
import { BASELINE, adjustRapport, feel, initialMood, moodLabel, settle } from "../../../../src/modules/community/chatbot/chatbotMood";

describe("chatbot learning rules", () => {
  it("spots real questions", () => {
    expect(isQuestion("Where do I find titanium ore?")).toBe(true);
    expect(isQuestion("how do I repair my ornithopter wings")).toBe(true);
    expect(isQuestion("lol?")).toBe(false);
    expect(isQuestion("nice base")).toBe(false);
  });

  it("keeps useful answers and drops non-answers and unsafe text", () => {
    expect(learnableAnswer("Titanium is in the Hagga Basin rock outcrops near the shield wall.")).toBe("Titanium is in the Hagga Basin rock outcrops near the shield wall.");
    expect(learnableAnswer("idk")).toBeNull();
    expect(learnableAnswer("lol same")).toBeNull();
    expect(learnableAnswer("did you check the map?")).toBeNull();
    expect(learnableAnswer("join discord.gg/abcdef for free spice")).toBeNull();
    expect(learnableAnswer("@everyone look at this right now")).toBeNull();
    expect(learnableAnswer("my password is hunter2 dont tell")).toBeNull();
    expect(learnableQuestion("<@123456789012345678> where is the trading post?")).toBe("where is the trading post?");
  });
});

describe("chatbot feelings", () => {
  it("lifts with kindness, drops with rudeness, and settles back over time", () => {
    const start = initialMood(0);
    expect(start.score).toBe(BASELINE);
    const kind = feel(start, "compliment", 0);
    expect(kind.score).toBeGreaterThan(BASELINE);
    let mood = start;
    for (let index = 0; index < 10; index += 1) mood = feel(mood, "insult", 0);
    expect(moodLabel(mood.score)).toBe("hurt");
    expect(settle(mood, 6 * 60 * 60_000).score).toBeCloseTo(BASELINE + (mood.score - BASELINE) / 2);
    expect(mood.score).toBeGreaterThanOrEqual(-100);
  });

  it("keeps rapport within bounds", () => {
    let rapport = 0;
    for (let index = 0; index < 50; index += 1) rapport = adjustRapport(rapport, "compliment");
    expect(rapport).toBe(50);
    expect(moodLabel(80)).toBe("thrilled");
    expect(moodLabel(10)).toBe("content");
  });
});
