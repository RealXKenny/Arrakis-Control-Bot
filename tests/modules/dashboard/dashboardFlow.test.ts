import type { Client } from "discord.js";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardOAuthRepository } from "../../../src/infrastructure/database/dashboard/DashboardOAuthRepository";
import { DashboardSessionRepository } from "../../../src/infrastructure/database/dashboard/DashboardSessionRepository";
import { DiscordOAuthClient } from "../../../src/infrastructure/http/discord/DiscordOAuthClient";
import { DashboardAccessService } from "../../../src/modules/dashboard/dashboardAccess";
import { DashboardOAuthService } from "../../../src/modules/dashboard/dashboardOAuth";

afterEach(() => vi.unstubAllGlobals());

it("issues a session through PKCE, rechecks guild permissions, and revokes access", async () => {
  const transactions = new Map<string, string>();
  const sessions = new Map<string, string>();
  const query = vi.fn((sql: string, args: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO bot_dashboard_oauth_transactions")) transactions.set(args[0] as string, args[1] as string);
    if (sql.startsWith("DELETE FROM bot_dashboard_oauth_transactions WHERE state_hash")) {
      const verifier = transactions.get(args[0] as string);
      transactions.delete(args[0] as string);
      return Promise.resolve({ rows: verifier ? [{ verifier }] : [] });
    }
    if (sql.startsWith("INSERT INTO bot_dashboard_sessions")) sessions.set(args[0] as string, args[1] as string);
    if (sql.startsWith("SELECT user_id")) {
      const userId = sessions.get(args[0] as string);
      return Promise.resolve({ rows: userId ? [{ user_id: userId }] : [] });
    }
    if (sql.startsWith("DELETE FROM bot_dashboard_sessions WHERE token_hash")) sessions.delete(args[0] as string);
    return Promise.resolve({ rows: [] });
  });
  const pool = { query } as unknown as Pool;
  const sessionStore = new DashboardSessionRepository(pool);
  const identity = new DiscordOAuthClient("123456789012345678", "synthetic-secret", "https://dashboard.example/callback");
  const oauth = new DashboardOAuthService(new DashboardOAuthRepository(pool), sessionStore, identity);
  const guildId = "323456789012345678";
  const userId = "223456789012345678";
  const has = vi.fn().mockReturnValue(true);
  const guild = { available: true, ownerId: "423456789012345678", fetch: vi.fn().mockResolvedValue(undefined),
    roles: { fetch: vi.fn().mockResolvedValue(undefined) }, members: { fetch: vi.fn().mockResolvedValue({ id: userId, permissions: { has } }) } };
  const client = { guilds: { cache: new Map([[guildId, guild]]) } } as unknown as Client;
  const access = new DashboardAccessService(sessionStore, client);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token_type: "Bearer", access_token: "synthetic-token" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: userId }))));

  const { state } = await oauth.begin();
  const token = await oauth.complete(state, state, "synthetic-code");
  expect(await access.authorize(token, guildId)).toEqual({ status: "authorized", userId });
  has.mockReturnValue(false);
  expect(await access.authorize(token, guildId)).toEqual({ status: "forbidden" });
  await access.logout(token);
  expect(await access.authorize(token, guildId)).toEqual({ status: "unauthenticated" });
  await expect(oauth.complete(state, state, "synthetic-code")).rejects.toThrow("already used");
});
