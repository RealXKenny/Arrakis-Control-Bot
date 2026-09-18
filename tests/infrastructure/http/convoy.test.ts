import { afterEach, expect, it, vi } from "vitest";
import { ConvoyClient } from "../../../src/infrastructure/http/convoy/ConvoyClient";
import { formatServer } from "../../../src/command-actions/server/monitoring/servers";

afterEach(() => vi.unstubAllGlobals());

it.each(["https://vps.example.com", "https://vps.example.com/api/v1/client"])("uses the versioned server endpoint with %s", async (base) => {
  const rows = [{ name: "Production", power_state: "running", limits: { addresses: { ipv4: [{ address: "203.0.113.10", is_primary: true }] } } }];
  const fetchMock = vi.fn().mockResolvedValue(Response.json(rows));
  vi.stubGlobal("fetch", fetchMock);
  await expect(new ConvoyClient(base, "test-key").listServers()).resolves.toEqual(rows);
  expect(String(fetchMock.mock.calls[0][0])).toBe("https://vps.example.com/api/v1/client/servers");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer test-key", Accept: "application/json" } });
  expect(formatServer(rows[0])).toContain("203.0.113.10");
  expect(formatServer(rows[0])).toContain("running");
});

it("does not treat a malformed server response as an empty team", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "unexpected" })));
  await expect(new ConvoyClient("https://vps.example.com", "key").listServers()).rejects.toThrow("unexpected server list");
});

it("exposes Retry-After without retrying requests", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: { "Retry-After": "30" } }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(new ConvoyClient("https://vps.example.com", "key").listServers()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("explains the current server permission when access is denied", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Forbidden" }, { status: 403 })));
  await expect(new ConvoyClient("https://vps.example.com", "key").listServers()).rejects.toThrow("server.read");
});

it("prefers primary addresses and supports IPv6-only servers", () => {
  expect(formatServer({ name: "one", limits: { addresses: { ipv4: [
    { address: "203.0.113.1", is_primary: false }, { address: "203.0.113.2", is_primary: true },
  ] } } })).toContain("203.0.113.2");
  expect(formatServer({ name: "two", limits: { addresses: { ipv6: [{ address: "2001:db8::1", is_primary: true }] } } })).toContain("2001:db8::1");
});
