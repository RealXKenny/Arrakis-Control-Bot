import type { DashboardAccessResult } from "../../../modules/dashboard/dashboardAccess";

interface OAuth {
  begin(): Promise<{ state: string; url: string }>;
  complete(state: string, cookieState: string, code: string): Promise<string>;
}
interface Access {
  authorize(token: string | undefined, guildId: string): Promise<DashboardAccessResult>;
  logout(token: string | undefined): Promise<void>;
}
const STATE_COOKIE = "__Host-arrakis_oauth";
const SESSION_COOKIE = "__Host-arrakis_session";
const SAFE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** Framework-neutral handlers. Mount only behind HTTPS with the configured public origin. */
export class DashboardAuthRoutes {
  private readonly origin: string;
  public constructor(publicOrigin: string, private readonly oauth: OAuth, private readonly access: Access) {
    const url = new URL(publicOrigin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Dashboard public URL must be an HTTPS origin");
    }
    this.origin = url.origin;
  }

  public async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const isKnown = ["/api/auth/discord", "/api/auth/discord/callback", "/api/auth/logout"].includes(url.pathname) ||
      /^\/api\/guilds\/[^/]+\/access$/.test(url.pathname);
    if (!isKnown) return null;
    const cookies = parseCookies(request.headers.get("cookie"));
    if (!cookies) return json({ error: "Invalid cookies" }, 400);
    if (url.pathname === "/api/auth/discord" && request.method === "GET") {
      if (url.search) return json({ error: "Invalid request" }, 400);
      try {
        const { state, url: destination } = await this.oauth.begin();
        const target = new URL(destination);
        if (!SAFE_TOKEN.test(state) || target.origin !== "https://discord.com" || target.pathname !== "/oauth2/authorize" ||
            target.username || target.password || target.hash) throw new Error("Invalid OAuth response");
        return redirect(target.toString(), cookie(STATE_COOKIE, state, 600));
      } catch { return json({ error: "Sign-in temporarily unavailable" }, 503); }
    }
    if (url.pathname === "/api/auth/discord/callback" && request.method === "GET") {
      if ([...url.searchParams.keys()].some((key) => key !== "code" && key !== "state") ||
          url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1) {
        return json({ error: "Invalid sign-in request" }, 400);
      }
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      const cookieState = cookies.get(STATE_COOKIE) ?? "";
      if (!SAFE_TOKEN.test(state) || !SAFE_TOKEN.test(cookieState) || !code || code.length > 2048) {
        return json({ error: "Invalid sign-in request" }, 400);
      }
      try {
        const token = await this.oauth.complete(state, cookieState, code);
        if (!SAFE_TOKEN.test(token)) throw new Error("Invalid session");
        const headers = new Headers(HEADERS);
        headers.set("Location", "/");
        headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
        headers.append("Set-Cookie", cookie(SESSION_COOKIE, token, 604800));
        return new Response(null, { status: 303, headers });
      } catch { return json({ error: "Sign-in could not be completed" }, 400); }
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      if (request.headers.get("origin") !== this.origin || request.headers.get("sec-fetch-site") === "cross-site") {
        return json({ error: "Invalid origin" }, 403);
      }
      try {
        await this.access.logout(cookies.get(SESSION_COOKIE));
        const headers = new Headers(HEADERS);
        headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
        return new Response(null, { status: 204, headers });
      } catch { return json({ error: "Sign-out temporarily unavailable" }, 503); }
    }
    const match = /^\/api\/guilds\/([1-9]\d{16,19})\/access$/.exec(url.pathname);
    if (match && request.method === "GET") {
      if (url.search) return json({ error: "Invalid request" }, 400);
      const result = await this.access.authorize(cookies.get(SESSION_COOKIE), match[1]);
      if (result.status === "authorized") return json({ ok: true, guildId: match[1] }, 200);
      return json({ error: result.status }, result.status === "unauthenticated" ? 401 : result.status === "forbidden" ? 403 : 503);
    }
    return json({ error: "Method or route not allowed" }, 405);
  }
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function parseCookies(header: string | null): Map<string, string> | null {
  if (header && header.length > 4096) return null;
  const result = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== STATE_COOKIE && key !== SESSION_COOKIE) continue;
    if (result.has(key)) return null;
    result.set(key, part.slice(separator + 1).trim());
  }
  return result;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}
function redirect(location: string, setCookie: string): Response {
  return new Response(null, { status: 303, headers: { ...HEADERS, Location: location, "Set-Cookie": setCookie } });
}
