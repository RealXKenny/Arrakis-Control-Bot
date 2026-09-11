import { describe, expect, it } from "vitest";
import { buildFaqPanel } from "../../src/modules/panels/faqPanel";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../src/shared/utils/discordLimits";

describe("FAQ panel", () => {
  it("contains the FAQ marker and stays within Discord component limits", () => {
    const panel = buildFaqPanel();
    const json = panel.map((component) => component.toJSON());

    expect(JSON.stringify(json)).toContain("CRIMSON SKIES FAQ");
    expect(countComponents(json)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
    expect(countDisplayableText(json)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  });
});
