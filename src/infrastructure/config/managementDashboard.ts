interface ManagementDashboardConfig {
  publicOrigin: string;
  host: string;
  port: number;
  clientId: string;
  clientSecret: string;
  rateLimitSecret: string;
}

/** Opt-in: the management dashboard starts only when MANAGEMENT_DASHBOARD_URL is set. */
function loadManagementDashboardConfig(env: NodeJS.ProcessEnv): ManagementDashboardConfig | undefined {
  const publicUrl = env.MANAGEMENT_DASHBOARD_URL?.trim();
  if (!publicUrl) return undefined;
  let url: URL;
  try { url = new URL(publicUrl); } catch { throw new Error("MANAGEMENT_DASHBOARD_URL must be a valid HTTPS origin."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MANAGEMENT_DASHBOARD_URL must be an HTTPS origin without a path or credentials.");
  }
  const clientId = env.CLIENT_ID?.trim();
  if (!clientId || !/^[1-9]\d{16,19}$/.test(clientId)) throw new Error("CLIENT_ID is required when the management dashboard is enabled.");
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required when the management dashboard is enabled.");
  const clientSecret = env.MANAGEMENT_DASHBOARD_CLIENT_SECRET?.trim();
  if (!clientSecret) throw new Error("MANAGEMENT_DASHBOARD_CLIENT_SECRET is required when the management dashboard is enabled.");
  const rateLimitSecret = env.MANAGEMENT_DASHBOARD_RATE_LIMIT_SECRET?.trim() ?? "";
  if (Buffer.byteLength(rateLimitSecret, "utf8") < 32) throw new Error("MANAGEMENT_DASHBOARD_RATE_LIMIT_SECRET must be at least 32 characters.");
  const port = Number(env.MANAGEMENT_DASHBOARD_PORT?.trim() || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MANAGEMENT_DASHBOARD_PORT must be a port from 1 to 65535.");
  const host = env.MANAGEMENT_DASHBOARD_HOST?.trim() || "0.0.0.0";
  return { publicOrigin: url.origin, host, port, clientId, clientSecret, rateLimitSecret };
}

export { loadManagementDashboardConfig };
export type { ManagementDashboardConfig };
