import { afterEach, describe, expect, it, vi } from "vitest";

import { ConvoyClient } from "../../src/infrastructure/api/ConvoyClient";
import { DuneConsoleClient } from "../../src/infrastructure/api/core/DuneConsoleClient";
import { DiscordAdapterClient } from "../../src/infrastructure/api/DiscordAdapterClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("external API clients", () => {
  it("preserves linked player identifiers returned by the Discord Adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          linked: true,
          message: "Linked player loaded",
          pawnId: "pawn-42",
          controllerId: 17,
          characterName: "Kenny",
          onlineStatus: "Offline",
          online: false,
        }),
      ),
    );

    const client = new DiscordAdapterClient("https://console.example.com", "test-token");

    await expect(client.getCurrentPlayer({ userId: "discord-user" })).resolves.toEqual({
      linked: true,
      message: "Linked player loaded",
      pawnId: "pawn-42",
      controllerId: 17,
      characterName: "Kenny",
      onlineStatus: "Offline",
      online: false,
    });
  });

  it("preserves link and verification details returned by the Discord Adapter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          message: "Code sent",
          characterName: "Kenny",
          onlineStatus: "Offline",
          expiresInSeconds: 300,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          message: "Linked",
          characterName: "Kenny",
          controllerId: "controller-42",
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = new DiscordAdapterClient("https://console.example.com", "test-token");

    await expect(client.linkPlayer({ userId: "discord-user" }, "Kenny")).resolves.toMatchObject({
      ok: true,
      message: "Code sent",
      characterName: "Kenny",
      onlineStatus: "Offline",
      expiresInSeconds: 300,
    });

    await expect(client.verifyPlayerLink({ userId: "discord-user" }, "ABC123")).resolves.toMatchObject({
      ok: true,
      message: "Linked",
      characterName: "Kenny",
      controllerId: "controller-42",
    });
  });

  it("rejects malformed Convoy JSON as an integration error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", { status: 200, headers: { "content-type": "application/json" } })));

    await expect(new ConvoyClient("https://vps.example.com", "test-key").request("GET", "/api/client/servers")).rejects.toMatchObject({
      name: "ConvoyApiError",
      status: 200,
    });
  });

  it("rejects non-Discord blueprint attachment URLs before downloading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await expect(
      client.uploadBlueprint(42, {
        name: "base.json",
        url: "https://example.com/base.json",
      }),
    ).rejects.toThrow("Blueprint attachments must be hosted by Discord");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized blueprint downloads from response metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-length": String(32 * 1024 * 1024 + 1) },
        }),
      ),
    );

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await expect(
      client.uploadBlueprint(42, {
        name: "base.json",
        url: "https://cdn.discordapp.com/attachments/1/2/base.json",
      }),
    ).rejects.toThrow("Blueprint files must be 32 MB or smaller");
  });

  it("does not retry non-idempotent Dune requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await expect(client.request("POST", "/api/test", { body: { value: 1 } })).rejects.toMatchObject({
      name: "DuneConsoleApiError",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-idempotent Dune requests after network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("socket closed"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await expect(client.request("POST", "/api/test", { body: { value: 1 } })).rejects.toMatchObject({
      name: "DuneConsoleApiError",
      status: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("authenticates JSON Console requests with a scoped bearer key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await client.request("POST", "/api/server/start", { body: {} });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(request.headers);

    expect(headers.get("authorization")).toBe("Bearer scoped-key");
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("x-csrf-token")).toBe(false);
  });

  it("uses bearer authentication for multipart Console uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");
    await client.requestMultipart("POST", "/api/blueprints/import", new FormData());

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(request.headers);

    expect(headers.get("authorization")).toBe("Bearer scoped-key");
    expect(headers.has("x-csrf-token")).toBe(false);
  });

  it("does not retry rejected API-key credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await expect(client.request("GET", "/api/server/status")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to create a Console client without an API key", () => {
    expect(() => new DuneConsoleClient("https://console.example.com", " ")).toThrow("CONSOLE_API_KEY is required");
  });

  it("refuses Console URLs containing embedded credentials", () => {
    expect(() => new DuneConsoleClient("https://user:secret@console.example.com", "scoped-key")).toThrow("must not contain embedded credentials");
  });

  it("never sends Console credentials to a different origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com", "scoped-key");

    await expect(client.request("GET", "https://untrusted.example.com/api/players")).rejects.toThrow("must use the configured Console origin");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
