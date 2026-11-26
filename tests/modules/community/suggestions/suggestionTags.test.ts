import { describe, expect, it } from "vitest";
import { currentStatus, missingStatusTagNames, resolveForumTags, withCategories, withStatus } from "../../../../src/modules/community/suggestions/suggestionTags";

const forumTags = [
  { id: "idea", name: "Idea" }, { id: "game", name: "Game" }, { id: "server", name: "🛠 Server" }, { id: "bots", name: "Bots" },
  { id: "review", name: "Under Review" }, { id: "progress", name: "In Progress" }, { id: "done", name: "Implemented" }, { id: "approved", name: "Approved" },
];

describe("suggestion tags", () => {
  it("resolves tags by name, ignoring case, emoji and spacing", () => {
    const tags = resolveForumTags(forumTags);
    expect(tags.categories.get("server")).toBe("server");
    expect(tags.statuses.get("in_progress")).toBe("progress");
    expect(tags.approvedTagId).toBe("approved");
    expect(resolveForumTags([{ id: "x", name: "on hold" }]).statuses.get("back_burner")).toBe("x");
  });

  it("lists only the missing status tags", () => {
    expect(missingStatusTagNames(forumTags)).toEqual(["Planned", "Back Burner", "Not Doing"]);
  });

  it("swaps the status tag and keeps categories", () => {
    const tags = resolveForumTags(forumTags);
    expect(withStatus(["game", "review"], "in_progress", tags)).toEqual(["progress", "game"]);
    expect(currentStatus(["game", "done"], tags)).toBe("implemented");
  });

  it("keeps Approved unless the post is ruled out or sent back to review", () => {
    const tags = resolveForumTags(forumTags);
    expect(withStatus(["approved", "progress"], "implemented", tags)).toEqual(["done", "approved"]);
    expect(withStatus(["approved", "progress"], "under_review", tags)).toEqual(["review"]);
  });

  it("never exceeds Discord's five applied tags", () => {
    const tags = resolveForumTags(forumTags);
    expect(withStatus(["idea", "game", "server", "bots", "approved"], "implemented", tags)).toHaveLength(5);
    expect(withCategories(["idea", "game", "server", "bots", "review"], ["bots", "game"], tags)).toHaveLength(5);
    expect(withCategories(["review"], ["game", "server"], tags)).toEqual(["review", "game", "server"]);
  });
});
