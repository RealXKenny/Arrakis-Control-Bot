import { isIP } from "node:net";
import type { DashboardRateScope } from "../../database/dashboard/DashboardRateLimitRepository";
import type { FrameworkRequest, FrameworkResponse } from "./DashboardFramework";
import { parseDashboardCookies, SESSION_COOKIE } from "./DashboardAuthRoutes";

type AccessStatus = "unauthenticated" | "forbidden" | "unavailable";
interface Authorization {
  run<T>(token: string | undefined, guildId: string, handler: (grant: string) => Promise<T>): Promise<
    { status: "authorized"; userId: string; value: T } | { status: AccessStatus }>;
}
interface Identity { identify(token: string | undefined): Promise<string | null> }
interface Guilds { list(userId: string): Promise<{ id: string; name: string; icon: string | null }[] | null> }
interface Audit {
  record(entry: { spaceId: string; userId: string; key: string; value: unknown }): Promise<void>;
  list(guildId: string): Promise<unknown[]>;
}
interface Limits { consume(scope: DashboardRateScope, subject: string, limit: number, windowSeconds: number): Promise<boolean> }
export interface DashboardGatewayDeps {
  publicOrigin: string;
  authorization: Authorization;
  identity: Identity;
  guilds: Guilds;
  audit: Audit;
  limits: Limits;
  dispatch(request: FrameworkRequest): Promise<FrameworkResponse>;
  onError(message: string, error: unknown): void;
}

const SPACE = /^\/api\/spaces\/discord\/([1-9]\d{16,19})\/(.+)$/;
const SETTING = /^settings\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})$/;
const SPACE_READS = new Set(["values", "channels", "roles", "entitlements", "resources/channel", "resources/role"]);
const PUBLIC_API = new Set(["/api/platforms", "/api/schema", "/api/builder/access"]);
// Framework operational routes outside /api that must never be public.
const BLOCKED_PATHS = new Set(["/metrics", "/health", "/ready"]);
const STATIC_PATH = /^\/(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*)?$/;
const MAX_RESPONSE_BYTES = 2_097_152;
export const MAX_DASHBOARD_BODY_BYTES = 16_384;
const JSON_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** The only entrance to the in-process framework server. Every space request is
 * freshly authorized, every other framework route is refused, OAuth query
 * strings and credentials never reach the framework, and writes need the
 * dashboard's own origin.
 */
export class DashboardFrameworkGateway {
  private readonly origin: string;
  public constructor(private readonly deps: DashboardGatewayDeps) {
    this.origin = new URL(deps.publicOrigin).origin;
  }

  public async handle(request: Request, remoteAddress: string): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    if (method !== "GET" && method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!isIP(remoteAddress)) return json({ error: "Service temporarily unavailable" }, 503);
    const cookies = parseDashboardCookies(request.headers.get("cookie"));
    if (!cookies) return json({ error: "Invalid cookies" }, 400);
    const token = cookies.get(SESSION_COOKIE);
    const write = method === "POST";
    try {
      if (!await this.deps.limits.consume("global", "dashboard", 1000, 60) ||
          !await this.deps.limits.consume(write ? "write" : "access", remoteAddress, write ? 30 : 120, 60)) {
        return json({ error: "Too many requests" }, 429);
      }
      if (!url.pathname.startsWith("/api/")) return write ? json({ error: "Not found" }, 404) : await this.serveStatic(url);
      if (write) return await this.handleWrite(request, url, token);
      if (PUBLIC_API.has(url.pathname)) {
        const query = url.pathname === "/api/schema" ? allowQuery(url, { locale: /^[a-z]{2}(?:-[A-Z]{2})?$/ }) : allowQuery(url, {});
        if (query === null) return json({ error: "Invalid request" }, 400);
        return await this.forward({ method: "GET", path: `${url.pathname}${query}` });
      }
      if (url.pathname === "/api/auth/me" || url.pathname === "/api/spaces") {
        if (url.search) return json({ error: "Invalid request" }, 400);
        const userId = await this.deps.identity.identify(token);
        if (!userId) return json({ error: "unauthorized" }, 401);
        if (url.pathname === "/api/auth/me") return json({ id: userId, username: null, avatar: null, platform: "discord" }, 200);
        const spaces = await this.deps.guilds.list(userId);
        return spaces ? json({ platform: "discord", spaces }, 200) : json({ error: "Service temporarily unavailable" }, 503);
      }
      const match = SPACE.exec(url.pathname);
      if (!match) return json({ error: "Not found" }, 404);
      const [, guildId, route] = match;
      const isRead = SPACE_READS.has(route) || SETTING.test(route) || route === "audit";
      if (!isRead) return json({ error: "Not found" }, 404);
      const query = route.startsWith("resources/") ? allowQuery(url, { filter: /^.{1,1024}$/s }) : allowQuery(url, {});
      if (query === null) return json({ error: "Invalid request" }, 400);
      if (route === "audit") {
        // The framework's history is per process; durable history is read from PostgreSQL.
        const result = await this.deps.authorization.run(token, guildId, () => this.deps.audit.list(guildId));
        return result.status === "authorized" ? json({ entries: result.value }, 200) : denied(result.status);
      }
      const result = await this.deps.authorization.run(token, guildId, (grant) =>
        this.deps.dispatch({ method: "GET", path: `${url.pathname}${query}`, grant }));
      return result.status === "authorized" ? fromFramework(result.value, true) : denied(result.status);
    } catch (error) {
      this.deps.onError(`Dashboard request failed: ${method} ${url.pathname}`, error);
      return json({ error: "Service temporarily unavailable" }, 503);
    }
  }

  private async handleWrite(request: Request, url: URL, token: string | undefined): Promise<Response> {
    const match = SPACE.exec(url.pathname);
    const setting = match ? SETTING.exec(match[2]) : null;
    if (!match || !setting || url.search) return json({ error: "Not found" }, 404);
    if (request.headers.get("origin") !== this.origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ error: "Invalid origin" }, 403);
    }
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
      return json({ error: "Unsupported content type" }, 415);
    }
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_DASHBOARD_BODY_BYTES) return json({ error: "Request too large" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("value" in parsed) || Object.keys(parsed).length !== 1) {
      return json({ error: "Invalid setting" }, 400);
    }
    const [, guildId] = match;
    const key = `${setting[1]}.${setting[2]}`;
    const value = (parsed as { value: unknown }).value;
    const result = await this.deps.authorization.run(token, guildId, (grant) =>
      this.deps.dispatch({ method: "POST", path: url.pathname, body: JSON.stringify({ value }), origin: this.origin, grant }));
    if (result.status !== "authorized") return denied(result.status);
    if (result.value.status === 200) {
      try { await this.deps.audit.record({ spaceId: guildId, userId: result.userId, key, value }); } catch (error) {
        // The setting is already saved; report the missing history rather than hiding the write.
        this.deps.onError(`Dashboard setting ${key} saved without an audit entry`, error);
      }
    }
    return fromFramework(result.value, true);
  }

  private async serveStatic(url: URL): Promise<Response> {
    if (BLOCKED_PATHS.has(url.pathname) || !STATIC_PATH.test(url.pathname) || url.pathname.includes("..")) return json({ error: "Not found" }, 404);
    const query = allowQuery(url, { _rsc: /^[A-Za-z0-9_-]{1,32}$/ });
    if (query === null) return json({ error: "Invalid request" }, 400);
    return fromFramework(await this.deps.dispatch({ method: "GET", path: `${url.pathname}${query}` }), false);
  }

  private async forward(request: FrameworkRequest): Promise<Response> {
    return fromFramework(await this.deps.dispatch(request), true);
  }
}

/** Returns the canonical query string, or null when any parameter is unexpected or repeated. */
function allowQuery(url: URL, allowed: Record<string, RegExp>): string | null {
  const params = new URLSearchParams();
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    const pattern = allowed[key];
    if (!pattern || seen.has(key) || !pattern.test(value)) return null;
    seen.add(key);
    params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function fromFramework(response: FrameworkResponse, requireJson: boolean): Response {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status > 599 || response.body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("Invalid framework response");
  }
  if (requireJson) {
    if (!response.headers["content-type"]?.startsWith("application/json")) throw new Error("Invalid framework response type");
    return json(JSON.parse(response.body.toString("utf8")) as unknown, response.status);
  }
  const headers = new Headers({ ...response.headers, "X-Content-Type-Options": "nosniff" });
  return new Response(response.status === 204 || response.status === 304 ? null : new Uint8Array(response.body), { status: response.status, headers });
}

function denied(status: AccessStatus): Response {
  return json({ error: status }, status === "unauthenticated" ? 401 : status === "forbidden" ? 403 : 503);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: JSON_HEADERS });
}
