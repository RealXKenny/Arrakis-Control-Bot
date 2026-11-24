import { isIP } from "node:net";
import type { DashboardRateLimitRepository } from "../../database/dashboard/DashboardRateLimitRepository";
import type { FrameworkAuthorization } from "../../../modules/dashboard/frameworkAuthorization";
import { parseDashboardCookies, SESSION_COOKIE } from "./DashboardAuthRoutes";

type Dispatch = (path: string) => Promise<{ status: number; body: string }>;
const ROUTE = /^\/api\/spaces\/discord\/([1-9]\d{16,19})\/(values|channels|roles|audit|entitlements)$/;
const MAX_BODY = 1_048_576;

/** Allowlisted read-only entrance to an in-process framework server.
 * Auth callbacks are handled outside the framework, so its request logger
 * never receives OAuth codes, state, cookies, or arbitrary query strings.
 */
export class DashboardFrameworkGateway {
  public constructor(private readonly authorization: FrameworkAuthorization,
    private readonly limits: Pick<DashboardRateLimitRepository, "consume">,
    private readonly dispatch: Dispatch) {}

  public async handle(request: Request, remoteAddress: string): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/spaces/")) return null;
    const match = ROUTE.exec(url.pathname);
    if (!match || request.method !== "GET" || url.search) return json({ error: "Not found" }, 404);
    if (!isIP(remoteAddress)) return json({ error: "Service temporarily unavailable" }, 503);
    const cookies = parseDashboardCookies(request.headers.get("cookie"));
    if (!cookies) return json({ error: "Invalid cookies" }, 400);
    try {
      if (!await this.limits.consume("global", "dashboard", 1000, 60) ||
          !await this.limits.consume("access", remoteAddress, 60, 60)) return json({ error: "Too many requests" }, 429);
      const result = await this.authorization.run(cookies.get(SESSION_COOKIE), match[1], () => this.dispatch(url.pathname));
      if (result.status !== "authorized") {
        return json({ error: result.status }, result.status === "unauthenticated" ? 401 : result.status === "forbidden" ? 403 : 503);
      }
      const { status, body } = result.value;
      if (!Number.isInteger(status) || status < 200 || status > 599 || Buffer.byteLength(body) > MAX_BODY) throw new Error("Invalid framework response");
      const parsed: unknown = JSON.parse(body);
      return json(parsed, status);
    } catch { return json({ error: "Service temporarily unavailable" }, 503); }
  }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
