import { afterEach, describe, expect, it, vi } from "vitest";

import { ConvoyClient } from "../src/infrastructure/api/ConvoyClient";
import { DuneConsoleClient } from "../src/infrastructure/api/core/DuneConsoleClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("external API clients", () => {
  it("rejects malformed Convoy JSON as an integration error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", { status: 200, headers: { "content-type": "application/json" } })));

    await expect(new ConvoyClient("https://vps.example.com", "test-key").request("GET", "/api/client/servers")).rejects.toMatchObject({
      name: "ConvoyApiError",
      status: 200,
    });
  });

  it("does not retry non-idempotent Dune requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com");

    await expect(client.request("POST", "/api/test", { authenticate: false, body: { value: 1 } })).rejects.toMatchObject({
      name: "DuneConsoleApiError",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
