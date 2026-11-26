import { describe, expect, it } from "vitest";
import { chooseCategories, classifySuggestion, scoreCategories } from "../../../../src/modules/community/suggestions/suggestionClassifier";
import { TfIdfIndex, tokenize } from "../../../../src/modules/community/suggestions/textAnalysis";

describe("suggestion classifier", () => {
  it("tags clear posts from the keyword lexicon", () => {
    expect(classifySuggestion("Desert heat", "Turn on desert heat on the server, restart with new settings")).toContain("server");
    expect(classifySuggestion("Weekend tournament", "A PvP tournament event with a prize every weekend")[0]).toBe("events");
    expect(classifySuggestion("Bot command for music", "Add a slash command to the bot that shows the music queue")[0]).toBe("bots");
    expect(classifySuggestion("New role colors", "Let members pick a cosmetic role color and emoji")[0]).toBe("cosmetic");
  });

  it("falls back to a general idea when nothing fits", () => {
    expect(classifySuggestion("Hmm", "what about it")).toEqual(["idea"]);
    expect(chooseCategories([])).toEqual(["idea"]);
  });

  it("returns at most two categories", () => {
    expect(classifySuggestion("Server event with rules", "server restart event tournament rules ban moderation cosmetic skin").length).toBeLessThanOrEqual(2);
  });

  it("learns from posts staff already tagged", () => {
    const index = new TfIdfIndex();
    index.set("a", tokenize("spice harvesting route guide for newcomers"));
    index.set("b", tokenize("spice harvesting tutorial for newcomers"));
    const labels = new Map([["a", ["events"] as const], ["b", ["events"] as const]]);
    const result = classifySuggestion("Newcomer spice harvesting tour", "a guided route for newcomers", index, (id) => [...(labels.get(id) ?? [])]);
    expect(result).toContain("events");
  });

  it("scores are bounded between 0 and 1", () => {
    for (const entry of scoreCategories("server server server lag ping restart", "server lag ping restart wipe performance")) {
      expect(entry.score).toBeGreaterThan(0);
      expect(entry.score).toBeLessThanOrEqual(1);
    }
  });
});
