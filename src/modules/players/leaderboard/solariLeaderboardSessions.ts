import { randomBytes } from "node:crypto";

interface LeaderboardSession {
  id: string;
  ownerId: string;
  requestedBy: string;
  page: number;
  totalPages: number;
  touchedAt: number;
}

const SESSION_TTL_MS = 15 * 60 * 1_000;
const MAX_SESSIONS = 500;
const sessions = new Map<string, LeaderboardSession>();

function sweepSessions(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function createLeaderboardSession(options: { ownerId: string; requestedBy: string; page?: number }): LeaderboardSession {
  sweepSessions();
  while (sessions.size >= MAX_SESSIONS) {
    const oldestId = sessions.keys().next().value as string | undefined;
    if (!oldestId) break;
    sessions.delete(oldestId);
  }

  const session: LeaderboardSession = {
    id: randomBytes(9).toString("base64url"),
    ownerId: options.ownerId,
    requestedBy: options.requestedBy,
    page: Math.max(1, Math.floor(options.page ?? 1)),
    totalPages: 1,
    touchedAt: Date.now(),
  };

  sessions.set(session.id, session);
  return session;
}

function getLeaderboardSession(id: string): LeaderboardSession | null {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.touchedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }

  session.touchedAt = Date.now();
  // Dev note: The leaderboard remembers who is on top, and who asked to look.
  sessions.delete(id);
  sessions.set(id, session);
  return session;
}

export { createLeaderboardSession, getLeaderboardSession };
export type { LeaderboardSession };
