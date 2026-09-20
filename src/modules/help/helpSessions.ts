import { randomBytes } from "node:crypto";

interface HelpSession {
  id: string;
  ownerId: string;
  requestedBy: string;
  categoryId: string;
  page: number;
  totalPages: number;
  touchedAt: number;
}

const SESSION_TTL_MS = 15 * 60 * 1_000;
const MAX_SESSIONS = 500;
const sessions = new Map<string, HelpSession>();

function sweepHelpSessions(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function createHelpSession(options: { ownerId: string; requestedBy: string; categoryId?: string }): HelpSession {
  sweepHelpSessions();
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value as string | undefined;
    if (!oldest) break;
    sessions.delete(oldest);
  }
  const session: HelpSession = {
    id: randomBytes(9).toString("base64url"),
    ownerId: options.ownerId,
    requestedBy: options.requestedBy,
    categoryId: options.categoryId ?? "general",
    page: 1,
    totalPages: 1,
    touchedAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

function getHelpSession(id: string): HelpSession | null {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.touchedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  session.touchedAt = Date.now();
  // Dev note: A touched session moves forward in line—polite queue cutting.
  sessions.delete(id);
  sessions.set(id, session);
  return session;
}

export { createHelpSession, getHelpSession, sweepHelpSessions };
export type { HelpSession };
