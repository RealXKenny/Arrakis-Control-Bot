import { describe, expect, it } from "vitest";
import { containsText } from "../../../src/shared/discord/containsText";

describe("component marker matching", () => {
  it("finds text nested inside containers and raw component data", () => {
    expect(containsText([{ components: [{ data: { content: "## Server Information" } }] }], "Server Information")).toBe(true);
    expect(containsText([{ components: [{ content: "Rules" }] }], "Rules")).toBe(true);
  });
  it("ignores unrelated text, malformed values, and non-text components", () => {
    expect(containsText([null, 5, { components: [null, { content: "Another panel" }] }, { data: { content: 7 } }], "Rules")).toBe(false);
  });
});
