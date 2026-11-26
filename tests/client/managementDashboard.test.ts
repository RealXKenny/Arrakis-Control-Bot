import { request as httpRequest } from "node:http";
import type { Client } from "discord.js";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import type { Logger } from "../../src/client/logger";
import { createManagementDashboard, type ManagementDashboard } from "../../src/client/managementDashboard";

const origin = "https://dashboard.example";
const guildId = "323456789012345678";
const userId = "223456789012345678";
let dashboard: ManagementDashboard | undefined;
afterEach(async () => { await dashboard?.stop(); dashboard = undefined; vi.unstubAllGlobals(); });

function send(port: number, path: string, headers: Record<string, string> = {}, method = "GET", body?: string) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

it("runs OAuth, fresh guild checks, framework reads, audited writes and logout through one listener", async () => {
  const sessions = new Map<string, string>();
  const transactions = new Map<string, string>();
  const settings = new Map<string, unknown>();
  const audit: unknown[] = [];
  const query = vi.fn((sql: string, args: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO bot_dashboard_oauth_transactions")) transactions.set(args[0] as string, args[1] as string);
    if (sql.startsWith("DELETE FROM bot_dashboard_oauth_transactions WHERE state_hash")) {
      const verifier = transactions.get(args[0] as string);
      transactions.delete(args[0] as string);
      return Promise.resolve({ rows: verifier ? [{ verifier }] : [] });
    }
    if (sql.startsWith("INSERT INTO bot_dashboard_rate_limits")) return Promise.resolve({ rows: [{ hits: 1 }] });
    if (sql.startsWith("INSERT INTO bot_dashboard_sessions")) sessions.set(args[0] as string, args[1] as string);
    if (sql.startsWith("SELECT user_id FROM bot_dashboard_sessions")) {
      const user = sessions.get(args[0] as string);
      return Promise.resolve({ rows: user ? [{ user_id: user }] : [] });
    }
    if (sql.startsWith("DELETE FROM bot_dashboard_sessions WHERE token_hash")) sessions.delete(args[0] as string);
    if (sql.startsWith("INSERT INTO bot_dashboard_settings")) settings.set(`${String(args[0])}:${String(args[1])}`, JSON.parse(args[2] as string));
    if (sql.startsWith("SELECT value FROM bot_dashboard_settings")) {
      const key = `${String(args[0])}:${String(args[1])}`;
      return Promise.resolve({ rows: settings.has(key) ? [{ value: settings.get(key) }] : [] });
    }
    if (sql.startsWith("INSERT INTO bot_dashboard_audit")) audit.push(args);
    return Promise.resolve({ rows: [] });
  });
  const has = vi.fn().mockReturnValue(true);
  const guild = { id: guildId, name: "Sietch", icon: null, available: true, ownerId: "423456789012345678", fetch: vi.fn().mockResolvedValue(undefined),
    roles: { fetch: vi.fn().mockResolvedValue(undefined), cache: new Map() }, channels: { cache: new Map() },
    members: { fetch: vi.fn().mockResolvedValue({ id: userId, permissions: { has } }) } };
  const client = { guilds: { cache: new Map([[guildId, guild]]) } } as unknown as Client;
  const logger = { header: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() } as unknown as Logger;
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token_type: "Bearer", access_token: "synthetic-token" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: userId }))).mockImplementation(realFetch));

  dashboard = createManagementDashboard(client, { query } as unknown as Pool, {
    publicOrigin: origin, host: "127.0.0.1", port: 0, clientId: "123456789012345678", clientSecret: "synthetic-secret", rateLimitSecret: "s".repeat(32),
  }, logger);
  await dashboard.start();
  const port = dashboard.port()!;

  const begin = await send(port, "/api/auth/discord");
  expect(begin.status).toBe(303);
  const state = new URL(begin.headers.location as string).searchParams.get("state")!;
  const callback = await send(port, `/api/auth/discord/callback?state=${state}&code=synthetic-code`, { cookie: `__Host-arrakis_oauth=${state}` });
  expect(callback.status).toBe(303);
  const cookie = (callback.headers["set-cookie"] as string[]).find((value) => value.startsWith("__Host-arrakis_session="))!.split(";")[0];

  expect(JSON.parse((await send(port, "/api/spaces", { cookie })).body)).toEqual({ platform: "discord", spaces: [{ id: guildId, name: "Sietch", icon: null }] });
  expect((await send(port, `/api/spaces/discord/${guildId}/values`, { cookie })).status).toBe(200);
  expect((await send(port, `/api/spaces/discord/${guildId}/settings/general/welcome`, { cookie, origin, "content-type": "application/json" }, "POST", JSON.stringify({ value: 1 }))).status).toBe(400);
  has.mockReturnValue(false);
  expect((await send(port, `/api/spaces/discord/${guildId}/values`, { cookie })).status).toBe(403);
  expect((await send(port, "/metrics")).status).toBe(404);
  expect((await send(port, "/api/auth/logout", { cookie, origin }, "POST")).status).toBe(204);
  expect((await send(port, `/api/spaces/discord/${guildId}/values`, { cookie })).status).toBe(401);
  expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain("synthetic-code");
  expect(audit).toEqual([]);
}, 30_000);
