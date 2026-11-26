import { randomBytes } from "node:crypto";

export interface FrameworkSessionData { platform: "discord"; userId: string; spaces: { id: string }[] }
export interface FrameworkRequest { method: "GET" | "POST"; path: string; body?: string; origin?: string; grant?: string }
export interface FrameworkResponse { status: number; headers: Record<string, string>; body: Buffer }
export interface FrameworkSpaceSource {
  resources(spaceId: string, kind: string, filter?: unknown): Promise<{ label: string; value: string }[]>;
  memberPermissions(spaceId: string, userId: string): Promise<string[]>;
}
export interface FrameworkSettingsStore { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
export interface FrameworkSettingsDefinition { categories: Record<string, unknown> }

export interface DashboardFrameworkOptions {
  publicOrigin: string;
  clientId: string;
  clientSecret: string;
  settings: FrameworkSettingsDefinition;
  store: FrameworkSettingsStore;
  source: FrameworkSpaceSource;
  /** Synchronous lookup of a single-request grant issued by FrameworkAuthorization. */
  session(grant: string | undefined): FrameworkSessionData | undefined;
}

export interface DashboardFramework {
  dispatch(request: FrameworkRequest): Promise<FrameworkResponse>;
  close(): Promise<void>;
}

// Both cookie names the framework may read, depending on NODE_ENV at import time.
const GRANT_COOKIES = ["dd_sid", "__Host-dd_sid"] as const;
const FORWARDED_HEADERS = ["content-type", "content-security-policy", "cache-control", "x-content-type-options", "x-frame-options",
  "referrer-policy", "strict-transport-security", "cross-origin-opener-policy", "cross-origin-resource-policy"];

/** Builds the Discord-Dashboard V3 server in memory. It never listens; the gateway dispatches allowlisted requests to it. */
export async function createDashboardFramework(options: DashboardFrameworkOptions): Promise<DashboardFramework> {
  const [{ buildServer, InProcessAdapter, SessionStore }, { discord }, { webRoot }] = await Promise.all([
    import("@acstane/core"), import("@acstane/platform-discord"), import("@acstane/web"),
  ]);

  // Sessions are owned by PostgreSQL and checked per request by the gateway; the
  // framework only sees grants for requests that already passed authorization.
  class GrantSessionStore extends SessionStore {
    public override get(id?: string): FrameworkSessionData | undefined { return options.session(id); }
    public override set(): void { /* Framework logins are not mounted. */ }
    public override destroy(): void { /* Logout is handled by the gateway. */ }
    public override create(): string { throw new Error("Framework sessions are disabled"); }
  }

  const origin = new URL(options.publicOrigin).origin;
  const sessions = new GrantSessionStore({ sweepMs: 0 });
  const adapter = new InProcessAdapter(options.settings as ConstructorParameters<typeof InProcessAdapter>[0], options.store, options.source);
  const app = await buildServer({
    port: 0,
    // Framework cookies are never issued; a random secret keeps its production guard satisfied.
    cookieSecret: randomBytes(32).toString("base64url"),
    allowedOrigins: [origin],
    platforms: [discord({ clientId: options.clientId, clientSecret: options.clientSecret, redirectUri: new URL("/api/auth/discord/callback", origin).toString() })],
    // Shared PostgreSQL limits run in front of the gateway; in-process dispatch shares one address.
    rateLimit: { max: 100_000, timeWindow: 60_000 },
  }, { def: options.settings as ConstructorParameters<typeof InProcessAdapter>[0], adapter, sessions, pages: false, web: { root: webRoot } });
  // The framework logger writes JSON per request; the gateway logs redacted paths instead.
  app.log.level = "warn";
  await app.ready();

  return {
    async dispatch(request) {
      const host = new URL(origin).host;
      const cookies = request.grant ? Object.fromEntries(GRANT_COOKIES.map((name) => [name, request.grant as string])) : undefined;
      const headers: Record<string, string> = { host };
      if (request.origin) headers.origin = request.origin;
      if (request.body !== undefined) headers["content-type"] = "application/json";
      const response = await app.inject({ method: request.method, url: request.path, headers, cookies,
        ...(request.body !== undefined ? { payload: request.body } : {}) });
      const forwarded: Record<string, string> = {};
      for (const name of FORWARDED_HEADERS) {
        const value = response.headers[name];
        if (typeof value === "string") forwarded[name] = value;
      }
      return { status: response.statusCode, headers: forwarded, body: response.rawPayload };
    },
    async close() {
      await app.close();
    },
  };
}
