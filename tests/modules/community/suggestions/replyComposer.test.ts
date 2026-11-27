import { describe, expect, it } from "vitest";
import { composeNewPostReply, composeStatusReply, extractTopic, formatCategories, seededRandom } from "../../../../src/modules/community/suggestions/replyComposer";
import { SUGGESTION_STATUSES } from "../../../../src/modules/community/suggestions/suggestionTags";

const base = { title: "Desert heat", body: "Turn on desert heat for RP", authorId: "123456789012345678", categories: ["server" as const] };

describe("assistant replies", () => {
  it("is deterministic per seed and varies across posts", () => {
    expect(composeNewPostReply({ ...base, seed: "1" })).toBe(composeNewPostReply({ ...base, seed: "1" }));
    const variants = new Set(Array.from({ length: 30 }, (_, index) => composeNewPostReply({ ...base, seed: String(index) })));
    expect(variants.size).toBeGreaterThan(5);
  });

  it("references the suggestion's own topic, author and tags", () => {
    const reply = composeNewPostReply({ ...base, seed: "x", relatedCount: 2 });
    expect(reply).toContain("<@123456789012345678>");
    expect(reply).toMatch(/desert heat/i);
    expect(reply).toContain("**Server**");
  });

  it("writes a reply for every status without unfilled placeholders", () => {
    for (const status of SUGGESTION_STATUSES) {
      for (let seed = 0; seed < 10; seed += 1) {
        const reply = composeStatusReply(status, { ...base, seed: `${seed}`, supportCount: 4, note: "Thanks *all*", actorId: "223456789012345678", featureName: "Heat_toggle", referenceUrl: "https://example.com/r" });
        expect(reply).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(reply).toContain("Thanks \\*all\\*");
        expect(reply).toContain("Heat\\_toggle");
        expect(reply.length).toBeLessThan(2_000);
      }
    }
  });

  it("escapes markdown in topics and falls back to body words", () => {
    expect(extractTopic("**bold** idea")).toBe("**\\*\\*bold\\*\\* idea**");
    expect(extractTopic("?!", "sandworm spawn rates")).toContain("sandworm");
    expect(extractTopic("", "")).toBe("this suggestion");
  });

  it("joins category names naturally", () => {
    expect(formatCategories(["game", "server"])).toBe("**Game** and **Server**");
    expect(formatCategories([])).toBe("**Idea**");
  });

  it("produces numbers in [0, 1)", () => {
    const random = seededRandom("seed");
    for (let index = 0; index < 100; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("words automatic moves differently and links the GitHub evidence", () => {
    const evidence = { kind: "release" as const, title: "v2.0.2 [$&]", url: "https://github.com/o/r/releases/v2.0.2" };
    const manual = composeStatusReply("implemented", { seed: "t", title: "Spice tracker", authorId: "123456789012345678" });
    const automatic = composeStatusReply("implemented", { seed: "t", title: "Spice tracker", authorId: "123456789012345678", evidence });
    expect(automatic).not.toBe(manual);
    expect(automatic).toContain("(<https://github.com/o/r/releases/v2.0.2>)");
    expect(automatic).toContain("$&");
    const openers = new Set(Array.from({ length: 30 }, (_, index) => composeStatusReply("in_progress", { seed: String(index), title: "Spice tracker", evidence: { ...evidence, kind: "pull" } }).split("\n")[0]));
    expect(openers.size).toBeGreaterThan(2);
  });

  it("quotes a detail from the post and asks a follow-up on short posts", () => {
    const long = composeNewPostReply({ seed: "a", title: "Spice tracker", body: "Guilds could log every harvest with the amount and location. That would help plan refinery runs.", authorId: "123456789012345678", categories: ["game"] });
    expect(long).toMatch(/“[^”]*(harvest|refinery)[^”]*”/);
    const short = composeNewPostReply({ seed: "a", title: "Spice tracker", body: "pls", authorId: "123456789012345678", categories: ["game"] });
    expect(short).toContain("?");
    const close = composeNewPostReply({ seed: "a", title: "Spice tracker", body: "", relatedCount: 1, closestTitle: "Track spice" });
    expect(close).toContain("**Track spice**");
  });
});
