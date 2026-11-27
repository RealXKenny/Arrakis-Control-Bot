import { describe, expect, it } from "vitest";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../../src/shared/discord/discordLimits";
import {
  createAssistantPanel, createFeatureMatchPanel, createOutcomePanel, createSimilarPanel, createSummaryPanel,
} from "../../../../src/modules/community/suggestions/suggestionPanels";
import { PANEL_STATUSES } from "../../../../src/modules/community/suggestions/suggestionTags";

const related = Array.from({ length: 10 }, (_, index) => ({ threadId: `12345678901234567${index}`, title: `Post ${index} ${"x".repeat(150)}`, score: 0.5, status: "planned" as const }));

function within(panel: { toJSON(): unknown }): void {
  const json = panel.toJSON();
  expect(countDisplayableText(json)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  expect(countComponents(json)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
}

describe("suggestion panels", () => {
  it("offers one staff button per status and disables the current one", () => {
    const json = createAssistantPanel({ reply: "Hello", status: "planned", related: related.slice(0, 3), updatedBy: "123456789012345678" }).toJSON();
    const text = JSON.stringify(json);
    for (const status of PANEL_STATUSES) expect(text).toContain(`suggestion-status:${status}`);
    expect(text).toContain("suggestion-summary");
    expect(text).toContain("suggestion-similar");
    const buttons = JSON.parse(text, (_key, value: unknown) => value) as unknown;
    const planned = findById(buttons, "suggestion-status:planned");
    expect(planned?.disabled).toBe(true);
    expect(findById(buttons, "suggestion-status:in_progress")?.disabled).toBe(false);
    within({ toJSON: () => json });
  });

  it("lists linked GitHub work", () => {
    const text = JSON.stringify(createAssistantPanel({ reply: "Hi", related: [], work: [{ kind: "release", title: "v2.0.2 [beta]", url: "https://github.com/o/r/releases/v2.0.2" }] }).toJSON());
    expect(text).toContain("On GitHub");
    expect(text).toContain("Release: [v2.0.2 beta](<https://github.com/o/r/releases/v2.0.2>)");
  });

  it("stays inside Discord limits with long content", () => {
    within(createAssistantPanel({ reply: "r".repeat(5_000), related, featureName: "f".repeat(200), work: Array.from({ length: 5 }, () => ({ kind: "pull", title: "w".repeat(300), url: "https://github.com/o/r/pull/1" })) }));
    within(createSimilarPanel("t".repeat(500), related));
    within(createSummaryPanel("t".repeat(500), { messageCount: 300, participantCount: 50, supportCount: 20, opposeCount: 3, keyPoints: Array.from({ length: 4 }, () => ({ authorId: "123456789012345678", text: "p".repeat(180) })), topTerms: ["a", "b"], firstAt: new Date(), lastAt: new Date() }));
    within(createOutcomePanel("Done", "intro", Array.from({ length: 40 }, (_, index) => ({ threadId: String(index), ok: index % 2 === 0, detail: "failed" }))));
  });

  it("binds the feature menu to its requester and preselects strong matches", () => {
    const feature = { id: "7", guildId: "g", name: "Heat", keywords: "", referenceUrl: null, status: "in_progress" as const, createdBy: "s", createdAt: new Date(), implementedAt: null, linkedCount: 0 };
    const json = createFeatureMatchPanel(feature, related.map((post, index) => ({ ...post, selected: index < 2 })), "123456789012345678").toJSON();
    const text = JSON.stringify(json);
    expect(text).toContain("suggestion-feature:7:123456789012345678");
    expect(text.match(/"default":true/g)).toHaveLength(2);
    within({ toJSON: () => json });
    expect(JSON.stringify(createFeatureMatchPanel(feature, [], "1").toJSON())).not.toContain("suggestion-feature:");
  });
});

function findById(value: unknown, id: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value.map((child) => findById(child, id)).find(Boolean);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.custom_id === id) return record;
  return Object.values(record).map((child) => findById(child, id)).find(Boolean);
}
