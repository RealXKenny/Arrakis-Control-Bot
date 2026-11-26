import { describe, expect, it } from "vitest";
import { loadManagementDashboardConfig } from "../../../src/infrastructure/config/managementDashboard";

const base = { MANAGEMENT_DASHBOARD_URL: "https://dashboard.example", CLIENT_ID: "123456789012345678", DATABASE_URL: "postgres://db/bot",
  MANAGEMENT_DASHBOARD_CLIENT_SECRET: "synthetic", MANAGEMENT_DASHBOARD_RATE_LIMIT_SECRET: "s".repeat(32) };

describe("management dashboard configuration", () => {
  it("is disabled unless a public URL is configured", () => {
    expect(loadManagementDashboardConfig({})).toBeUndefined();
  });

  it("loads defaults for a complete configuration", () => {
    expect(loadManagementDashboardConfig(base)).toEqual({ publicOrigin: "https://dashboard.example", host: "0.0.0.0", port: 3001,
      clientId: base.CLIENT_ID, clientSecret: "synthetic", rateLimitSecret: "s".repeat(32) });
    expect(loadManagementDashboardConfig({ ...base, MANAGEMENT_DASHBOARD_PORT: "8080", MANAGEMENT_DASHBOARD_HOST: "127.0.0.1" })).toMatchObject({ port: 8080, host: "127.0.0.1" });
  });

  it.each([
    [{ MANAGEMENT_DASHBOARD_URL: "http://dashboard.example" }, "HTTPS origin"],
    [{ MANAGEMENT_DASHBOARD_URL: "https://user:pass@dashboard.example" }, "HTTPS origin"],
    [{ MANAGEMENT_DASHBOARD_URL: "https://dashboard.example/admin" }, "HTTPS origin"],
    [{ CLIENT_ID: "" }, "CLIENT_ID"],
    [{ DATABASE_URL: "" }, "DATABASE_URL"],
    [{ MANAGEMENT_DASHBOARD_CLIENT_SECRET: "" }, "CLIENT_SECRET"],
    [{ MANAGEMENT_DASHBOARD_RATE_LIMIT_SECRET: "short" }, "RATE_LIMIT_SECRET"],
    [{ MANAGEMENT_DASHBOARD_PORT: "70000" }, "PORT"],
  ])("fails clearly for invalid settings %#", (override, message) => {
    expect(() => loadManagementDashboardConfig({ ...base, ...override })).toThrow(message);
  });
});
