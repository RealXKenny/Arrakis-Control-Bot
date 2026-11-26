import { describe, expect, it } from "vitest";
import { TfIdfIndex, normalizeText, stem, tokenize } from "../../../../src/modules/community/suggestions/textAnalysis";

describe("suggestion text analysis", () => {
  it("drops links, mentions, emoji and stop words", () => {
    expect(normalizeText("Check https://example.com <@123456789012345678> <:spice:123456789012345678>")).not.toMatch(/example|123456/);
    expect(tokenize("I think we should add Desert Heat to the server, please!")).toEqual(["desert", "heat", "server"]);
  });

  it("stems common suffixes consistently", () => {
    expect(stem("storms")).toBe(stem("storm"));
    expect(stem("crafting")).toBe("craft");
    expect(stem("abilities")).toBe("ability");
    expect(stem("status")).toBe("status");
  });

  it("ranks the closest document first and supports removal", () => {
    const index = new TfIdfIndex();
    index.set("heat", tokenize("Turn on desert heat for the server"));
    index.set("rp", tokenize("Switch the server to roleplay rules"));
    index.set("worm", tokenize("Make sandworms more aggressive in the deep desert"));
    const results = index.similar(tokenize("Desert heat setting"));
    expect(results[0]?.id).toBe("heat");
    expect(index.similar(tokenize("heat"), { exclude: new Set(["heat"]) }).map((result) => result.id)).not.toContain("heat");
    index.remove("heat");
    expect(index.size).toBe(2);
    expect(index.similar(tokenize("heat"))).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    const index = new TfIdfIndex();
    index.set("a", tokenize("anything"));
    expect(index.similar([])).toEqual([]);
  });
});
