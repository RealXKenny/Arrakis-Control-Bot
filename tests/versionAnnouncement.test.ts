import { Collection, type Client } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceCurrentVersion } from "../src/modules/panels/versionAnnouncement";

vi.mock("../src/shared/factories/imageFactory", () => ({
  createDuneBanner: () => ({ attachment: Buffer.from("banner") }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(markers: string[] = []) {
  vi.stubEnv("DISCORD_SHARD_ID", "0");
  vi.stubEnv("ROLE_ANNOUNCEMENTS_ID", "");
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => [{
      tag_name: "v1.0.0",
      name: null,
      published_at: url.includes("Dashboard") ? "2026-09-07T12:00:00Z" : "2026-09-06T12:00:00Z",
      body: "Release changes",
      html_url: url.replace("api.github.com/repos/", "github.com/").replace("?per_page=100", "/tag/v1.0.0"),
      draft: false,
      prerelease: false,
    }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  const send = vi.fn().mockResolvedValue(undefined);
  const channel = {
    isSendable: () => true,
    messages: {
      fetch: vi.fn().mockResolvedValue(new Collection(markers.map((marker, index) => [String(index), {
        content: "",
        components: [{ components: [{ content: marker }] }],
      }]))),
    },
    send,
  };
  const client = { user: {}, channels: { fetch: vi.fn().mockResolvedValue(channel) } } as unknown as Client;
  return { client, send, fetchMock };
}

describe("version announcements", () => {
  it("announces matching versions from both repositories in date order with project links", async () => {
    const { client, send, fetchMock } = setup();
    await announceCurrentVersion(client, "announcements");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
    const cards = send.mock.calls.map(([payload]) => JSON.stringify(payload.components[0].toJSON()));
    expect(cards[0]).toContain("## Arrakis Control Bot v1.0.0");
    expect(cards[0]).toContain('"url":"https://github.com/RealXKenny/Arrakis-Control-Bot"');
    expect(cards[1]).toContain("## Arrakis Control Dashboard v1.0.0");
    expect(cards[1]).toContain('"url":"https://github.com/RealXKenny/Arrakis-Control-Dashboard"');
  });

  it("recognizes legacy bot announcements without suppressing dashboard releases", async () => {
    const { client, send } = setup(["## Arrakis Control v1.0.0"]);
    await announceCurrentVersion(client, "announcements");
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls[0][0].components[0].toJSON())).toContain("## Arrakis Control Dashboard v1.0.0");
  });

  it("does not repeat already announced versions for either project", async () => {
    const { client, send } = setup(["## Arrakis Control Bot v1.0.0", "## Arrakis Control Dashboard v1.0.0"]);
    await announceCurrentVersion(client, "announcements");
    expect(send).not.toHaveBeenCalled();
  });
});
