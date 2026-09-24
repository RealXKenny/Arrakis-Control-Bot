import { describe, expect, it } from "vitest";
import { canvasDisplayName } from "../../../src/shared/discord/canvasText";

describe("canvas display names", () => {
  it("converts mathematical script usernames to glyphs available in the canvas font", () => {
    expect(canvasDisplayName("𝓔𝓜𝓢𝓖𝓐𝓜𝓔𝓡𝓓𝓤𝓓𝓔", "fallback")).toBe("EMSGAMERDUDE");
  });

  it("preserves ordinary Unicode names while removing layout controls", () => {
    expect(canvasDisplayName("  Chani\nKynes  José  李  ", "fallback")).toBe("Chani Kynes José 李");
  });

  it("uses and normalizes the fallback for an empty name", () => {
    expect(canvasDisplayName(" \r\n ", "𝓟𝓪𝓾𝓵")).toBe("Paul");
  });

  it("truncates by Unicode characters without splitting surrogate pairs", () => {
    expect(canvasDisplayName("A😀B", "fallback", 2)).toBe("A😀");
  });
});
