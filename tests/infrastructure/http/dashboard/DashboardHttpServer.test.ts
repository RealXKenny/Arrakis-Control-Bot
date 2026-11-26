import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardHttpServer } from "../../../../src/infrastructure/http/dashboard/DashboardHttpServer";

const origin = "https://dashboard.example";
let server: DashboardHttpServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

async function start(handler = vi.fn((request: Request) => Promise.resolve(Response.json({ url: request.url, method: request.method,
  cookie: request.headers.get("cookie"), authorization: request.headers.get("authorization") }, { headers: { "Set-Cookie": "a=1" } }))) as (request: Request, address: string) => Promise<Response | null>) {
  const log = vi.fn();
  const onError = vi.fn();
  server = new DashboardHttpServer(origin, [handler], log, onError);
  await server.listen(0, "127.0.0.1");
  return { log, onError, handler, port: server.port! };
}

function send(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: options.headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end(options.body);
  });
}

describe("dashboard HTTP server", () => {
  it("rebuilds requests on the public origin, forwards only needed headers, and sets security headers", async () => {
    const { port } = await start();
    const response = await send(port, "/api/spaces?x=1", { headers: { host: "evil.example", cookie: "c=1", authorization: "Bearer secret" } });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ url: `${origin}/api/spaces?x=1`, method: "GET", cookie: "c=1", authorization: null });
    expect(response.headers["strict-transport-security"]).toContain("max-age");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["set-cookie"]).toEqual(["a=1"]);
  });

  it("logs only method, path, status and duration so OAuth codes never reach logs", async () => {
    const { port, log } = await start();
    await send(port, "/api/auth/discord/callback?code=secret-code&state=secret-state", { headers: { cookie: "__Host-arrakis_session=secret-token" } });
    expect(log).toHaveBeenCalledWith({ method: "GET", path: "/api/auth/discord/callback", status: 200, durationMs: expect.any(Number) });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret/);
  });

  it("bounds bodies and rejects bodies on reads and absolute-form targets", async () => {
    const { port, handler } = await start();
    expect((await send(port, "/x", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(20_000) })).status).toBe(413);
    expect((await send(port, "/x", { method: "GET", body: "abc", headers: { "content-length": "3" } })).status).toBe(413);
    expect((await send(port, "http://evil.example/x")).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    const post = await send(port, "/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(post.status).toBe(200);
  });

  it("returns a generic error when a handler throws and 404 when none matches", async () => {
    const failing = await start(() => Promise.reject(new Error("boom")));
    const response = await send(failing.port, "/x");
    expect(response.status).toBe(500);
    expect(response.body).not.toContain("boom");
    expect(failing.onError).toHaveBeenCalledOnce();
    await server?.close();
    const none = await start(() => Promise.resolve(null));
    expect((await send(none.port, "/missing")).status).toBe(404);
  });
});
