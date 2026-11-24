import { describe, expect, it, vi } from "vitest";
import { DashboardAuthRoutes } from "../../../../src/infrastructure/http/dashboard/DashboardAuthRoutes";

const state = "s".repeat(43);
const token = "t".repeat(43);
const guild = "123456789012345678";
function setup() {
  const oauth = { begin: vi.fn().mockResolvedValue({ state, url: "https://discord.com/oauth2/authorize?state=test" }),
    complete: vi.fn().mockResolvedValue(token) };
  const access = { authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "223456789012345678" }),
    logout: vi.fn().mockResolvedValue(undefined) };
  const limits = { consume: vi.fn().mockResolvedValue(true) };
  return { routes: new DashboardAuthRoutes("https://dashboard.example", oauth, access, limits), oauth, access, limits };
}
const call = (routes: DashboardAuthRoutes, request: Request) => routes.handle(request, "192.0.2.1");
const request = (path: string, options?: RequestInit) => new Request(`https://dashboard.example${path}`, options);

describe("dashboard authentication routes", () => {
  it("starts OAuth with a host-only secure state cookie", async () => {
    const { routes } = setup();
    const response = await call(routes, request("/api/auth/discord"));
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toContain("https://discord.com/oauth2/authorize");
    expect(response?.headers.get("set-cookie")).toContain(`__Host-arrakis_oauth=${state}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("requires browser-bound state and issues a secure session after completion", async () => {
    const { routes, oauth } = setup();
    const response = await call(routes, request(`/api/auth/discord/callback?state=${state}&code=code`, {
      headers: { Cookie: `__Host-arrakis_oauth=${state}` },
    }));
    expect(response?.status).toBe(303);
    expect(oauth.complete).toHaveBeenCalledWith(state, state, "code");
    expect(response?.headers.getSetCookie()).toContainEqual(expect.stringContaining(`__Host-arrakis_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`));
  });

  it("rejects duplicate state and ambiguous cookies before exchanging codes", async () => {
    const { routes, oauth } = setup();
    expect((await call(routes, request(`/api/auth/discord/callback?state=${state}&state=${state}&code=code`)))?.status).toBe(400);
    expect((await call(routes, request("/api/auth/discord", { headers: { Cookie: `__Host-arrakis_oauth=${state}; __Host-arrakis_oauth=${state}` } })))?.status).toBe(400);
    expect(oauth.complete).not.toHaveBeenCalled();
  });

  it("requires the exact origin for logout and never accepts GET logout", async () => {
    const { routes, access } = setup();
    expect((await call(routes, request("/api/auth/logout", { method: "POST" })))?.status).toBe(403);
    expect((await call(routes, request("/api/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" } })))?.status).toBe(403);
    expect((await call(routes, request("/api/auth/logout")))?.status).toBe(405);
    expect((await call(routes, request("/api/auth/logout", { method: "POST", headers: { Origin: "https://dashboard.example", Cookie: `__Host-arrakis_session=${token}` } })))?.status).toBe(204);
    expect(access.logout).toHaveBeenCalledOnce();
    expect(access.logout).toHaveBeenCalledWith(token);
  });

  it("maps fresh access decisions without disclosing user identity", async () => {
    const { routes, access } = setup();
    const response = await call(routes, request(`/api/guilds/${guild}/access`, { headers: { Cookie: `__Host-arrakis_session=${token}` } }));
    expect(await response?.json()).toEqual({ ok: true, guildId: guild });
    expect(access.authorize).toHaveBeenCalledWith(token, guild);
    access.authorize.mockResolvedValueOnce({ status: "forbidden" }).mockResolvedValueOnce({ status: "unavailable" });
    expect((await call(routes, request(`/api/guilds/${guild}/access`)))?.status).toBe(403);
    expect((await call(routes, request(`/api/guilds/${guild}/access`)))?.status).toBe(503);
  });

  it("uses only the socket address and fails closed when limits reject or fail", async () => {
    const { routes, limits, oauth } = setup();
    const req = request("/api/auth/discord", { headers: { "X-Forwarded-For": "203.0.113.10" } });
    limits.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline"));
    expect((await routes.handle(req, "192.0.2.1"))?.status).toBe(429);
    expect(limits.consume).toHaveBeenCalledWith("oauth", "192.0.2.1", 20, 60);
    expect((await routes.handle(req, "192.0.2.1"))?.status).toBe(503);
    expect((await routes.handle(req, "not-an-ip"))?.status).toBe(503);
    expect(oauth.begin).not.toHaveBeenCalled();
  });
});
