import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { MAX_DASHBOARD_BODY_BYTES } from "./DashboardFrameworkGateway";

type Handler = (request: Request, remoteAddress: string) => Promise<Response | null>;
type RequestLog = (entry: { method: string; path: string; status: number; durationMs: number }) => void;

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
};
const FORWARDED_REQUEST_HEADERS = ["cookie", "origin", "sec-fetch-site", "content-type"];

/** Plain HTTP listener for a TLS-terminating reverse proxy. Requests are rebuilt
 * against the configured public origin, so Host headers cannot change routing,
 * and the request log records only method, path, status and duration.
 */
export class DashboardHttpServer {
  private readonly server: Server;
  private readonly origin: string;

  public constructor(publicOrigin: string, private readonly handlers: readonly Handler[], private readonly log: RequestLog,
    private readonly onError: (error: unknown) => void) {
    this.origin = new URL(publicOrigin).origin;
    this.server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000, maxHeaderSize: 16_384 }, (req, res) => {
      void this.respond(req, res);
    });
    this.server.keepAliveTimeout = 5_000;
  }

  public async listen(port: number, host: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => { this.server.off("error", reject); resolve(); });
    });
  }

  /** The bound port, or undefined before listening. */
  public get port(): number | undefined {
    const address = this.server.address();
    return typeof address === "object" && address ? address.port : undefined;
  }

  public async close(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeIdleConnections();
    });
  }

  /** Exposed for tests; production traffic arrives through the listener. */
  public async handle(request: Request, remoteAddress: string): Promise<Response> {
    for (const handler of this.handlers) {
      const response = await handler(request, remoteAddress);
      if (response) return response;
    }
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  private async respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = performance.now();
    const method = req.method ?? "GET";
    const rawUrl = req.url ?? "/";
    // Absolute-form targets and paths are rebuilt on the public origin; query strings are never logged.
    const path = rawUrl.startsWith("/") && !rawUrl.startsWith("//") ? rawUrl.split("?")[0] : "";
    let status = 500;
    try {
      let response: Response;
      if (!path) {
        response = Response.json({ error: "Invalid request" }, { status: 400 });
      } else {
        const body = await readBody(req, method);
        if (body === null) {
          response = Response.json({ error: "Request too large" }, { status: 413 });
        } else {
          const headers = new Headers();
          for (const name of FORWARDED_REQUEST_HEADERS) {
            const value = req.headers[name];
            if (typeof value === "string") headers.set(name, value);
          }
          const request = new Request(new URL(rawUrl, this.origin), { method, headers, ...(body ? { body } : {}) });
          response = await this.handle(request, req.socket.remoteAddress ?? "");
        }
      }
      status = response.status;
      const outgoing: Record<string, string | string[]> = { ...SECURITY_HEADERS };
      response.headers.forEach((value, name) => { if (name !== "set-cookie") outgoing[name] = value; });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing["set-cookie"] = cookies;
      res.writeHead(status, outgoing);
      res.end(method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      this.onError(error);
      if (!res.headersSent) res.writeHead(500, { ...SECURITY_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "Internal error" }));
    } finally {
      try {
        this.log({ method, path: path || "<invalid>", status, durationMs: Math.round(performance.now() - started) });
      } catch { /* Logging must never break a response. */ }
    }
  }
}

/** Reads a bounded body for POST; other methods must not carry one. Returns null when too large. */
async function readBody(req: IncomingMessage, method: string): Promise<string | null | undefined> {
  const length = Number(req.headers["content-length"] ?? 0);
  if (method !== "POST") return Number.isFinite(length) && length === 0 && !req.headers["transfer-encoding"] ? undefined : null;
  if (!Number.isFinite(length) || length > MAX_DASHBOARD_BODY_BYTES) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    if (size > MAX_DASHBOARD_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
