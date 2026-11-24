import type { Client } from "discord.js";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardOAuthRepository } from "../../../src/infrastructure/database/dashboard/DashboardOAuthRepository";
import { DashboardSessionRepository } from "../../../src/infrastructure/database/dashboard/DashboardSessionRepository";
import { DiscordOAuthClient } from "../../../src/infrastructure/http/discord/DiscordOAuthClient";
import { DashboardAuthRoutes } from "../../../src/infrastructure/http/dashboard/DashboardAuthRoutes";
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
  const routes = new DashboardAuthRoutes("https://dashboard.example", oauth, access);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token_type: "Bearer", access_token: "synthetic-token" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: userId }))));

  const start = await routes.handle(new Request("https://dashboard.example/api/auth/discord"));
  const state = new URL(start!.headers.get("location")!).searchParams.get("state")!;
  const callback = await routes.handle(new Request(`https://dashboard.example/api/auth/discord/callback?state=${state}&code=synthetic-code`, {
    headers: { Cookie: `__Host-arrakis_oauth=${state}` },
  }));
  expect(callback?.status).toBe(303);
  const sessionCookie = callback!.headers.getSetCookie().find((value) => value.startsWith("__Host-arrakis_session="))!.split(";")[0];
  const check = () => routes.handle(new Request(`https://dashboard.example/api/guilds/${guildId}/access`, { headers: { Cookie: sessionCookie } }));
  expect((await check())?.status).toBe(200);
  has.mockReturnValue(false);
  expect((await check())?.status).toBe(403);
  expect((await routes.handle(new Request("https://dashboard.example/api/auth/logout", {
    method: "POST", headers: { Cookie: sessionCookie, Origin: "https://dashboard.example" },
  })))?.status).toBe(204);
  expect((await check())?.status).toBe(401);
  await expect(oauth.complete(state, state, "synthetic-code")).rejects.toThrow("already used");
});
