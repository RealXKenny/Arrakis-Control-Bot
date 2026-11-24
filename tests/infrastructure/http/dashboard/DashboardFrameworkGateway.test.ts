import { expect, it, vi } from "vitest";
import { DashboardFrameworkGateway } from "../../../../src/infrastructure/http/dashboard/DashboardFrameworkGateway";
import { FrameworkAuthorization } from "../../../../src/modules/dashboard/frameworkAuthorization";

const guild = "123456789012345678";
const path = `/api/spaces/discord/${guild}/values`;

it("checks current authorization and forwards only an allowlisted path", async () => {
  const authorize = vi.fn(() => Promise.resolve({ status: "authorized" as const, userId: "223456789012345678" }));
  const bridge = new FrameworkAuthorization({ authorize });
  const dispatch = vi.fn(() => Promise.resolve({ status: 200, body: JSON.stringify({ session: bridge.get() }) }));
  const gateway = new DashboardFrameworkGateway(bridge, { consume: () => Promise.resolve(true) }, dispatch);
  const response = await gateway.handle(new Request(`https://example.test${path}`, { headers: { cookie: "__Host-arrakis_session=token", authorization: "secret" } }), "192.0.2.1");
  expect(response?.status).toBe(200);
  expect(authorize).toHaveBeenCalledWith("token", guild);
  expect(dispatch).toHaveBeenCalledWith(path);
  expect(await response?.json()).toEqual({ session: { platform: "discord", userId: "223456789012345678", spaces: [{ id: guild }] } });
  expect(bridge.get()).toBeUndefined();
});

it("rejects unknown, writable, and query-bearing routes before dispatch", async () => {
  const authorize = vi.fn(() => Promise.resolve({ status: "authorized" as const, userId: "user" }));
  const dispatch = vi.fn(() => Promise.resolve({ status: 200, body: "{}" }));
  const gateway = new DashboardFrameworkGateway(new FrameworkAuthorization({ authorize }), { consume: () => Promise.resolve(true) }, dispatch);
  for (const [url, method] of [[`${path}?code=secret`, "GET"], [path, "POST"], [`/api/spaces/discord/${guild}/stream`, "GET"]]) {
    expect((await gateway.handle(new Request(`https://example.test${url}`, { method }), "192.0.2.1"))?.status).toBe(404);
  }
  expect(authorize).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

it("fails closed for denied access, storage outages, and malformed framework output", async () => {
  const dispatch = vi.fn(() => Promise.resolve({ status: 200, body: "invalid" }));
  const denied = new DashboardFrameworkGateway(new FrameworkAuthorization({ authorize: () => Promise.resolve({ status: "forbidden" }) }), { consume: () => Promise.resolve(true) }, dispatch);
  const request = new Request(`https://example.test${path}`);
  expect((await denied.handle(request, "192.0.2.1"))?.status).toBe(403);
  expect(dispatch).not.toHaveBeenCalled();
  const allowed = new FrameworkAuthorization({ authorize: () => Promise.resolve({ status: "authorized", userId: "user" }) });
  expect((await new DashboardFrameworkGateway(allowed, { consume: () => Promise.reject(new Error("offline")) }, dispatch).handle(request, "192.0.2.1"))?.status).toBe(503);
  expect((await new DashboardFrameworkGateway(allowed, { consume: () => Promise.resolve(true) }, dispatch).handle(request, "192.0.2.1"))?.status).toBe(503);
});
