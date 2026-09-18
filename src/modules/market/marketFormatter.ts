import { catalogItemName } from "../players/administration/gameCatalogs";
import { escapeMarkdown } from "discord.js";

interface MarketItemRow {
  display_name?: unknown;
  template_id?: unknown;
  category?: unknown;
  quality_level?: unknown;
  tier?: unknown;
  lowest_price?: unknown;
  total_stock?: unknown;
  listing_count?: unknown;
}

interface MarketPage {
  rows: MarketItemRow[];
  totalCount: number;
  totalItems: number;
  categories: string[];
  available: boolean;
  reason?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

const toCount = (value: unknown, fallback: number): number => {
  const number = Number(value);

  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
};

const getText = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return undefined;

  const text = String(value).trim();
  return text || undefined;
};

function parseMarketPage(value: unknown): MarketPage {
  if (!isRecord(value)) {
    return { rows: [], totalCount: 0, totalItems: 0, categories: [], available: true };
  }

  const rows = Array.isArray(value.rows) ? value.rows.filter(isRecord) : [];
  const capabilities = isRecord(value.capabilities) ? value.capabilities : null;
  const exchangeCapability = capabilities?.exchange;
  const exchangeDetails = isRecord(exchangeCapability) ? exchangeCapability : null;
  const available = exchangeDetails ? exchangeDetails.available !== false && exchangeDetails.enabled !== false : exchangeCapability !== false;
  const reason = getText(exchangeDetails?.reason ?? capabilities?.reason ?? value.reason);
  const categories = Array.isArray(value.categories) ? [...new Set(value.categories.map(getText).filter((category): category is string => Boolean(category)))].sort((left, right) => left.localeCompare(right)) : [];

  return {
    rows,
    totalCount: toCount(value.totalCount, rows.length),
    totalItems: toCount(value.totalItems, rows.length),
    categories,
    available,
    reason,
  };
}

function parseBuybackPercent(value: unknown): number | null {
  if (!isRecord(value)) return null;

  const schedules = isRecord(value.schedules) ? value.schedules : null;
  const candidates = [value.buyback, value.buybackSchedule, value.buyback_schedule, schedules?.buyback];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;

    const percent = Number(candidate.buybackPercent ?? candidate.buyback_percent);

    if (Number.isInteger(percent) && percent >= 1 && percent <= 500) return percent;
  }

  return null;
}

function calculateBuybackPrice(lowestPrice: unknown, buybackPercent: number | null): string | null {
  const price = getText(lowestPrice);

  if (!price || buybackPercent === null || !Number.isInteger(buybackPercent) || buybackPercent < 1 || buybackPercent > 500) return null;

  if (/^\d+$/.test(price)) {
    try {
      return ((BigInt(price) * BigInt(buybackPercent)) / 100n).toString();
    } catch {
      return null;
    }
  }

  const numericPrice = Number(price);
  return Number.isFinite(numericPrice) && numericPrice >= 0 ? String(Math.floor(numericPrice * (buybackPercent / 100))) : null;
}

function formatMarketNumber(value: unknown): string {
  const text = getText(value);

  if (!text) return "Unknown";

  if (/^-?\d+$/.test(text)) {
    try {
      return BigInt(text).toLocaleString("en-US");
    } catch {
      return text;
    }
  }

  const number = Number(text);
  return Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits: 2 }) : text;
}

function formatMarketRow(row: MarketItemRow, buybackPercent: number | null = null): string {
  const rawName = getText(row.display_name) ?? catalogItemName(String(row.template_id)) ?? getText(row.template_id) ?? "Unknown item";
  const name = escapeMarkdown(rawName).slice(0, 120);
  const quality = getText(row.quality_level);
  const category = getText(row.category);
  const tier = getText(row.tier);
  const details = [quality ? `Grade ${escapeMarkdown(quality)}` : null, tier ? `Tier ${escapeMarkdown(tier)}` : null, category ? escapeMarkdown(category) : null].filter(Boolean).join(" · ");
  const price = formatMarketNumber(row.lowest_price);
  const buybackPrice = calculateBuybackPrice(row.lowest_price, buybackPercent);
  const stock = formatMarketNumber(row.total_stock);
  const listings = formatMarketNumber(row.listing_count);
  const buyback = buybackPrice === null ? "**Buyback:** Unavailable" : `**Buyback (${buybackPercent}%):** **${formatMarketNumber(buybackPrice)} Solaris** recommended listing price`;

  return [`**${name}**${details ? ` — ${details}` : ""}`, `Lowest ask: **${price} Solaris** · Stock: **${stock}** · Listings: **${listings}**`, buyback].join("\n");
}

function formatMarketRows(rows: MarketItemRow[], buybackPercent: number | null = null): string {
  return rows.length ? rows.map((row) => formatMarketRow(row, buybackPercent)).join("\n\n") : "No active sell orders matched those filters.";
}

export { calculateBuybackPrice, formatMarketNumber, formatMarketRow, formatMarketRows, parseBuybackPercent, parseMarketPage };

export type { MarketItemRow, MarketPage };
