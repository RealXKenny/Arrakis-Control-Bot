import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDashboardFramework, type DashboardFramework, type FrameworkSessionData } from "../../../../src/infrastructure/http/dashboard/DashboardFramework";

const origin = "https://dashboard.example";
const guild = "123456789012345678";
const grants = new Map<string, FrameworkSessionData>([["grant", { platform: "discord", userId: "223456789012345678", spaces: [{ id: guild }] }]]);
const store = new Map<string, unknown>();
let framework: DashboardFramework;

// Exercises the real Discord-Dashboard V3 beta server in memory, with no listener.
beforeAll(async () => {
  const { defineSettings } = await import("@acstane/schema");
  const settings = defineSettings((s, f) => ({ general: s.category({ name: "General", options: { welcome: f.text({ label: "Welcome", default: "hello" }) } }) }));
  framework = await createDashboardFramework({
    publicOrigin: origin, clientId: "123456789012345678", clientSecret: "synthetic-secret",
    settings,
    store: { get: (key) => Promise.resolve(store.has(key) ? store.get(key) : null), set: (key, value) => { store.set(key, value); return Promise.resolve(); } },
    source: { resources: () => Promise.resolve([{ label: "general", value: "323456789012345678" }]), memberPermissions: () => Promise.resolve([]) },
    session: (grant) => (grant ? grants.get(grant) : undefined),
  });
}, 30_000);
afterAll(async () => { await framework.close(); });

describe("dashboard framework adapter", () => {
  it("accepts only gateway grants as framework sessions", async () => {
    const values = await framework.dispatch({ method: "GET", path: `/api/spaces/discord/${guild}/values`, grant: "grant" });
    expect(values.status).toBe(200);
    expect(JSON.parse(values.body.toString())).toEqual({ values: { "general.welcome": "hello" } });
    expect((await framework.dispatch({ method: "GET", path: `/api/spaces/discord/${guild}/values` })).status).toBe(401);
    expect((await framework.dispatch({ method: "GET", path: `/api/spaces/discord/${guild}/values`, grant: "forged" })).status).toBe(401);
    expect((await framework.dispatch({ method: "GET", path: "/api/spaces/discord/923456789012345678/values", grant: "grant" })).status).toBe(403);
  });

  it("persists writes through the injected store and resolves pickers through the source", async () => {
    const write = await framework.dispatch({ method: "POST", path: `/api/spaces/discord/${guild}/settings/general/welcome`, body: JSON.stringify({ value: "hi" }), origin, grant: "grant" });
    expect(write.status).toBe(200);
    expect(store.get(`${guild}:general.welcome`)).toBe("hi");
    const channels = await framework.dispatch({ method: "GET", path: `/api/spaces/discord/${guild}/resources/channel`, grant: "grant" });
    expect(JSON.parse(channels.body.toString())).toEqual({ items: [{ label: "general", value: "323456789012345678" }] });
  });

  it("never issues framework login sessions and serves the bundled web app", async () => {
    expect((await framework.dispatch({ method: "GET", path: "/api/auth/discord" })).status).toBe(500);
    const page = await framework.dispatch({ method: "GET", path: "/" });
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors");
  });
});
