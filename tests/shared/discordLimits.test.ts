import { describe, expect, it } from "vitest";

import { countComponents, countDisplayableText, sanitizeAttachmentName, truncateDiscordText } from "../../src/shared/utils/discordLimits";

describe("Discord limits", () => {
  it("truncates by Unicode code point without splitting emoji", () => {
    expect(Array.from(truncateDiscordText("😀😀😀😀", 3, "…"))).toEqual(["😀", "😀", "…"]);
  });

  it("counts nested components and all displayable text fields", () => {
    const payload = {
      type: 17,
      components: [{ type: 10, content: "Body" }, { type: 2, label: "Open", description: "Details" }],
    };

    expect(countComponents(payload)).toBe(3);
    expect(countDisplayableText(payload)).toBe("BodyOpenDetails".length);
  });

  it("creates bounded safe attachment names while preserving extensions", () => {
    const name = sanitizeAttachmentName(`../bad:${"x".repeat(200)}.json`);
    expect(name).toHaveLength(100);
    expect(name).toMatch(/\.json$/);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});
