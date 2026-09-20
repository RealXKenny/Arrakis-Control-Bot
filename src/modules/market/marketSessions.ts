import { randomBytes } from "node:crypto";

type MarketSeller = "all" | "player" | "bot";

interface MarketSession {
  id: string;
  ownerId: string;
  requestedBy: string;
  search?: string;
  category?: string;
  seller: MarketSeller;
  page: number;
  totalPages: number;
  categories: string[];
  buybackPercent?: number | null;
  touchedAt: number;
}

const SESSION_TTL_MS = 15 * 60 * 1_000;
const MAX_SESSIONS = 500;
const sessions = new Map<string, MarketSession>();

function sweepSessions(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function createMarketSession(options: { ownerId: string; requestedBy: string; search?: string; category?: string; seller?: string; page?: number }): MarketSession {
  sweepSessions();
  while (sessions.size >= MAX_SESSIONS) {
    const oldestId = sessions.keys().next().value as string | undefined;
    if (!oldestId) break;
    sessions.delete(oldestId);
  }

  const seller: MarketSeller = options.seller === "player" || options.seller === "bot" ? options.seller : "all";
  const session: MarketSession = {
    id: randomBytes(9).toString("base64url"),
    ownerId: options.ownerId,
    requestedBy: options.requestedBy,
    search: options.search,
    category: options.category,
    seller,
    page: Math.max(1, Math.floor(options.page ?? 1)),
    totalPages: 1,
    categories: [],
    touchedAt: Date.now(),
  };

  sessions.set(session.id, session);
  return session;
}

function getMarketSession(id: string): MarketSession | null {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.touchedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }

  session.touchedAt = Date.now();
  // Dev note: Recently visited market stalls stay open; dusty ones make room.
  sessions.delete(id);
  sessions.set(id, session);
  return session;
}

export { createMarketSession, getMarketSession };
export type { MarketSeller, MarketSession };
