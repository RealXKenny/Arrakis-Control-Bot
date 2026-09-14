import { describe, expect, it } from "vitest";

import { data } from "../../../src/commands/economy/market/market";
import { calculateBuybackPrice, formatMarketNumber, formatMarketRows, parseBuybackPercent, parseMarketPage } from "../../../src/modules/market/marketFormatter";
import { createMarketCard } from "../../../src/modules/market/marketBrowser";
import { createMarketSession, getMarketSession } from "../../../src/modules/market/marketSessions";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../src/shared/discord/discordLimits";

describe("market formatter", () => {
  it("registers public market browsing options", () => {
    const command = data.toJSON();

    expect(command.name).toBe("market");
    expect(command.options?.map((option) => option.name)).toEqual(["search", "category", "seller", "page"]);
  });

  it("parses market rows, counts, and exchange capability", () => {
    expect(
      parseMarketPage({
        rows: [{ display_name: "Spice Melange" }],
        totalCount: 42,
        totalItems: 81,
        capabilities: { exchange: true },
      }),
    ).toEqual({
      rows: [{ display_name: "Spice Melange" }],
      totalCount: 42,
      totalItems: 81,
      categories: [],
      available: true,
      reason: undefined,
    });
  });

  it("preserves an unavailable capability reason", () => {
    expect(parseMarketPage({ capabilities: { exchange: false, reason: "Required exchange tables are missing." } })).toMatchObject({
      available: false,
      reason: "Required exchange tables are missing.",
    });
  });

  it("formats bigint prices without losing precision", () => {
    expect(formatMarketNumber("9007199254740993")).toBe("9,007,199,254,740,993");
  });

  it("reads the saved buyback percentage and calculates an integer-safe recommendation", () => {
    expect(parseBuybackPercent({ buyback: { buybackPercent: 60 } })).toBe(60);
    expect(calculateBuybackPrice("125000", 60)).toBe("75000");
    expect(calculateBuybackPrice("9007199254740993", 60)).toBe("5404319552844595");
  });

  it("formats listing details and escapes item markdown", () => {
    expect(
      formatMarketRows([
        {
          display_name: "*Spice* Harvester",
          quality_level: 5,
          category: "Vehicles",
          lowest_price: "125000",
          total_stock: "4",
          listing_count: "2",
        },
      ], 60),
    ).toContain("**\\*Spice\\* Harvester** — Grade 5 · Vehicles\nLowest ask: **125,000 Solaris** · Stock: **4** · Listings: **2**\n**Buyback (60%):** **75,000 Solaris** recommended listing price");
  });

  it("builds bounded category and pagination controls", () => {
    const session = createMarketSession({ ownerId: "user", requestedBy: "Trader", seller: "all" });
    session.categories = Array.from({ length: 30 }, (_, index) => `Category ${index} ${"x".repeat(60)}`);
    session.totalPages = 205;

    const card = createMarketCard("Market row\n".repeat(500), "Page 1 of 205", session).toJSON();
    const json = JSON.stringify(card);

    expect(json).toContain("All categories");
    expect(json).toContain(`market-page:${session.id}:next`);
    expect(json).toContain(`market-page:${session.id}:last`);
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(countComponents(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
  });

  it("expires stale market browser sessions", () => {
    const session = createMarketSession({ ownerId: "user", requestedBy: "Trader" });
    session.touchedAt = 0;

    expect(getMarketSession(session.id)).toBeNull();
  });
});
