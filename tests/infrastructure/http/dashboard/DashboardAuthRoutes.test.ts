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
  return { routes: new DashboardAuthRoutes("https://dashboard.example", oauth, access), oauth, access };
}
const request = (path: string, options?: RequestInit) => new Request(`https://dashboard.example${path}`, options);

describe("dashboard authentication routes", () => {
  it("starts OAuth with a host-only secure state cookie", async () => {
    const { routes } = setup();
    const response = await routes.handle(request("/api/auth/discord"));
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toContain("https://discord.com/oauth2/authorize");
    expect(response?.headers.get("set-cookie")).toContain(`__Host-arrakis_oauth=${state}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("requires browser-bound state and issues a secure session after completion", async () => {
    const { routes, oauth } = setup();
    const response = await routes.handle(request(`/api/auth/discord/callback?state=${state}&code=code`, {
      headers: { Cookie: `__Host-arrakis_oauth=${state}` },
    }));
    expect(response?.status).toBe(303);
    expect(oauth.complete).toHaveBeenCalledWith(state, state, "code");
    expect(response?.headers.getSetCookie()).toContainEqual(expect.stringContaining(`__Host-arrakis_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`));
  });

  it("rejects duplicate state and ambiguous cookies before exchanging codes", async () => {
    const { routes, oauth } = setup();
    expect((await routes.handle(request(`/api/auth/discord/callback?state=${state}&state=${state}&code=code`)))?.status).toBe(400);
    expect((await routes.handle(request("/api/auth/discord", { headers: { Cookie: `__Host-arrakis_oauth=${state}; __Host-arrakis_oauth=${state}` } })))?.status).toBe(400);
    expect(oauth.complete).not.toHaveBeenCalled();
  });

  it("requires the exact origin for logout and never accepts GET logout", async () => {
    const { routes, access } = setup();
    expect((await routes.handle(request("/api/auth/logout", { method: "POST" })))?.status).toBe(403);
    expect((await routes.handle(request("/api/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" } })))?.status).toBe(403);
    expect((await routes.handle(request("/api/auth/logout")))?.status).toBe(405);
    expect((await routes.handle(request("/api/auth/logout", { method: "POST", headers: { Origin: "https://dashboard.example", Cookie: `__Host-arrakis_session=${token}` } })))?.status).toBe(204);
    expect(access.logout).toHaveBeenCalledOnce();
    expect(access.logout).toHaveBeenCalledWith(token);
  });

  it("maps fresh access decisions without disclosing user identity", async () => {
    const { routes, access } = setup();
    const response = await routes.handle(request(`/api/guilds/${guild}/access`, { headers: { Cookie: `__Host-arrakis_session=${token}` } }));
    expect(await response?.json()).toEqual({ ok: true, guildId: guild });
    expect(access.authorize).toHaveBeenCalledWith(token, guild);
    access.authorize.mockResolvedValueOnce({ status: "forbidden" }).mockResolvedValueOnce({ status: "unavailable" });
    expect((await routes.handle(request(`/api/guilds/${guild}/access`)))?.status).toBe(403);
    expect((await routes.handle(request(`/api/guilds/${guild}/access`)))?.status).toBe(503);
  });
});
