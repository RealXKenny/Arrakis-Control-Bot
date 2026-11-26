import { describe, expect, it, vi } from "vitest";
import type { FrameworkRequest } from "../../../../src/infrastructure/http/dashboard/DashboardFramework";
import { DashboardFrameworkGateway } from "../../../../src/infrastructure/http/dashboard/DashboardFrameworkGateway";
import { FrameworkAuthorization } from "../../../../src/modules/dashboard/frameworkAuthorization";

const origin = "https://dashboard.example";
const guild = "123456789012345678";
const user = "223456789012345678";
const space = `/api/spaces/discord/${guild}`;
const jsonResponse = (body: unknown, status = 200) => ({ status, headers: { "content-type": "application/json; charset=utf-8" } as Record<string, string>, body: Buffer.from(JSON.stringify(body)) });

function setup(status: "authorized" | "unauthenticated" | "forbidden" | "unavailable" = "authorized") {
  const authorize = vi.fn(() => Promise.resolve(status === "authorized" ? { status, userId: user } : { status }));
  const authorization = new FrameworkAuthorization({ authorize });
  const seen: (FrameworkRequest & { session?: unknown })[] = [];
  const dispatch = vi.fn((request: FrameworkRequest) => {
    seen.push({ ...request, session: authorization.get(request.grant) });
    return Promise.resolve(jsonResponse({ ok: true }));
  });
  const deps = {
    publicOrigin: origin, authorization, dispatch,
    identity: { identify: vi.fn((token: string | undefined) => Promise.resolve(token === "token" ? user : null)) },
    guilds: { list: vi.fn(() => Promise.resolve([{ id: guild, name: "Sietch", icon: null }] as { id: string; name: string; icon: string | null }[] | null)) },
    audit: { record: vi.fn(() => Promise.resolve()), list: vi.fn(() => Promise.resolve([{ key: "general.welcome" }])) },
    limits: { consume: vi.fn(() => Promise.resolve(true)) },
    onError: vi.fn(),
  };
  return { gateway: new DashboardFrameworkGateway(deps), deps, authorize, dispatch, seen };
}
const call = (gateway: DashboardFrameworkGateway, path: string, init?: RequestInit) =>
  gateway.handle(new Request(`${origin}${path}`, { ...init, headers: { cookie: "__Host-arrakis_session=token", ...(init?.headers as Record<string, string> | undefined) } }), "192.0.2.1");

describe("dashboard framework gateway", () => {
  it("rechecks access and passes a single-request grant for space reads", async () => {
    const { gateway, authorize, seen } = setup();
    const response = await call(gateway, `${space}/values`, { headers: { authorization: "secret" } });
    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith("token", guild);
    expect(seen[0]).toMatchObject({ method: "GET", path: `${space}/values`, session: { userId: user, spaces: [{ id: guild }] } });
    expect(JSON.stringify(seen)).not.toContain("secret");
  });

  it("lists guilds and identity from PostgreSQL sessions instead of login-time framework state", async () => {
    const { gateway, dispatch, deps } = setup();
    expect(await (await call(gateway, "/api/spaces")).json()).toEqual({ platform: "discord", spaces: [{ id: guild, name: "Sietch", icon: null }] });
    expect(await (await call(gateway, "/api/auth/me")).json()).toMatchObject({ id: user, platform: "discord" });
    deps.guilds.list.mockResolvedValueOnce(null);
    expect((await call(gateway, "/api/spaces")).status).toBe(503);
    expect((await gateway.handle(new Request(`${origin}/api/spaces`), "192.0.2.1")).status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses framework routes outside the allowlist and unexpected queries", async () => {
    const { gateway, dispatch, authorize } = setup();
    for (const path of [`${space}/values?code=secret`, `${space}/stream`, `${space}/actions/test`, "/api/auth/discord/callback", "/api/openapi.json",
      "/metrics", "/health", "/ready", "/x%2F..%2Fetc", "/api/pages/x", `${space}/resources/channel?filter=a&filter=b`, "/api/schema?locale=../x", "/index.html?code=x"]) {
      expect([400, 404]).toContain((await call(gateway, path)).status);
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });

  it("forwards public schema and static assets without a grant", async () => {
    const { gateway, seen, dispatch } = setup();
    expect((await call(gateway, "/api/schema?locale=en")).status).toBe(200);
    dispatch.mockResolvedValueOnce({ status: 200, headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'" }, body: Buffer.from("<html>") });
    const page = await call(gateway, "/manage");
    expect(await page.text()).toBe("<html>");
    expect(page.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(seen.map((request) => [request.path, request.grant])).toEqual([["/api/schema?locale=en", undefined]]);
    expect(dispatch).toHaveBeenLastCalledWith({ method: "GET", path: "/manage" });
  });

  it("requires the dashboard origin and JSON for writes, then records durable audit history", async () => {
    const { gateway, seen, deps } = setup();
    const path = `${space}/settings/general/welcome`;
    const write = (headers: Record<string, string>, body = JSON.stringify({ value: "hello" })) => call(gateway, path, { method: "POST", headers, body });
    expect((await write({ "content-type": "application/json" })).status).toBe(403);
    expect((await write({ origin: "https://evil.example", "content-type": "application/json" })).status).toBe(403);
    expect((await write({ origin, "content-type": "text/plain" })).status).toBe(415);
    expect((await write({ origin, "content-type": "application/json" }, "{")).status).toBe(400);
    expect((await write({ origin, "content-type": "application/json" }, JSON.stringify({ value: 1, spaceId: "x" }))).status).toBe(400);
    expect((await write({ origin, "content-type": "application/json" }, JSON.stringify({ value: "x".repeat(20_000) }))).status).toBe(413);
    expect(seen).toHaveLength(0);
    expect((await write({ origin, "content-type": "application/json" })).status).toBe(200);
    expect(seen[0]).toMatchObject({ method: "POST", path, origin, body: JSON.stringify({ value: "hello" }), session: { userId: user } });
    expect(deps.audit.record).toHaveBeenCalledWith({ spaceId: guild, userId: user, key: "general.welcome", value: "hello" });
    expect(deps.limits.consume).toHaveBeenCalledWith("write", "192.0.2.1", 30, 60);
  });

  it("reports a saved write whose audit entry failed and serves audit history from storage", async () => {
    const { gateway, deps } = setup();
    deps.audit.record.mockRejectedValueOnce(new Error("offline"));
    const response = await call(gateway, `${space}/settings/general/welcome`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ value: 1 }) });
    expect(response.status).toBe(200);
    expect(deps.onError).toHaveBeenCalledWith(expect.stringContaining("without an audit entry"), expect.any(Error));
    expect(await (await call(gateway, `${space}/audit`)).json()).toEqual({ entries: [{ key: "general.welcome" }] });
  });

  it("fails closed for denied access, limits, storage outages and malformed framework output", async () => {
    for (const [status, code] of [["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const) {
      const { gateway, dispatch } = setup(status);
      expect((await call(gateway, `${space}/values`)).status).toBe(code);
      expect(dispatch).not.toHaveBeenCalled();
    }
    const limited = setup();
    limited.deps.limits.consume.mockResolvedValueOnce(false);
    expect((await call(limited.gateway, `${space}/values`)).status).toBe(429);
    limited.deps.limits.consume.mockRejectedValueOnce(new Error("offline"));
    expect((await call(limited.gateway, `${space}/values`)).status).toBe(503);
    limited.dispatch.mockResolvedValueOnce({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<script>") });
    expect((await call(limited.gateway, `${space}/values`)).status).toBe(503);
    expect(limited.deps.onError).toHaveBeenCalledWith(`Dashboard request failed: GET ${space}/values`, expect.any(Error));
  });
});
