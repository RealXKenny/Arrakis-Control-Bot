import { afterEach, expect, it, vi } from "vitest";
import { createHelpSession, getHelpSession } from "../../src/modules/help/helpSessions";
import { createMarketSession, getMarketSession } from "../../src/modules/market/marketSessions";

afterEach(() => vi.useRealTimers());

it.each([
  ["help", createHelpSession, getHelpSession],
  ["market", createMarketSession, getMarketSession],
] as const)("keeps all 500 %s sessions on reads and evicts only on insertion", (_name, create, get) => {
  vi.useFakeTimers();
  const sessions = Array.from({ length: 500 }, () => create({ ownerId: "owner", requestedBy: "owner" }));
  expect(get(sessions[0].id)).not.toBeNull();
  const extra = create({ ownerId: "owner", requestedBy: "owner" });
  expect(get(sessions[1].id)).toBeNull();
  expect(get(sessions[0].id)).not.toBeNull();
  expect(get(extra.id)).not.toBeNull();
  vi.advanceTimersByTime(15 * 60_000 + 1);
  expect(get(extra.id)).toBeNull();
});
