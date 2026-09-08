import { afterEach, describe, expect, it, vi } from "vitest";

import { ConvoyClient } from "../src/infrastructure/api/ConvoyClient";
import { DuneConsoleClient } from "../src/infrastructure/api/core/DuneConsoleClient";
import { DiscordAdapterClient } from "../src/infrastructure/api/DiscordAdapterClient";

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

    const client = new DuneConsoleClient("https://console.example.com");

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

    const client = new DuneConsoleClient("https://console.example.com");

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

    const client = new DuneConsoleClient("https://console.example.com");

    await expect(client.request("POST", "/api/test", { authenticate: false, body: { value: 1 } })).rejects.toMatchObject({
      name: "DuneConsoleApiError",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-idempotent Dune requests after network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("socket closed"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DuneConsoleClient("https://console.example.com");

    await expect(client.request("POST", "/api/test", { authenticate: false, body: { value: 1 } })).rejects.toMatchObject({
      name: "DuneConsoleApiError",
      status: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
