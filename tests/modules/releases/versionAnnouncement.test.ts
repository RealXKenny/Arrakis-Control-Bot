import type { ReleaseAnnouncementChannel, ReleaseAnnouncementRecord, ReleaseAnnouncementStorage } from "../../../src/infrastructure/database/releases/ReleaseAnnouncementRepository";
import { Collection, type Client } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceCurrentVersion, refreshReleaseAnnouncements, replayReleaseAnnouncements } from "../../../src/modules/releases/versionAnnouncement";
import { DISCORD_LIMITS, countDisplayableText } from "../../../src/shared/discord/discordLimits";

vi.mock("../../../src/shared/discord/imageFactory", () => ({
  createDuneBanner: () => ({ attachment: Buffer.from("banner") }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(markers: string[] = [], releaseBody = "Release changes") {
  vi.stubEnv("DISCORD_SHARD_ID", "0");
  vi.stubEnv("ROLE_ANNOUNCEMENTS_ID", "");
  const fetchMock = vi.fn((url: string): Promise<Response> => Promise.resolve({
    ok: true,
    json: () => Promise.resolve([{
      tag_name: "v1.0.0",
      name: null,
      published_at: url.includes("Dashboard") ? "2026-09-07T12:00:00Z" : "2026-09-06T12:00:00Z",
      body: releaseBody,
      html_url: url.replace("api.github.com/repos/", "github.com/").replace("?per_page=100", "/tag/v1.0.0"),
      draft: false,
      prerelease: false,
    }]),
  } as Response));
  vi.stubGlobal("fetch", fetchMock);
  const crosspost = vi.fn().mockResolvedValue(undefined);
  let sentId = 0;
  const send = vi.fn().mockImplementation(() => Promise.resolve({ id: `sent-${++sentId}`, crosspostable: true, crosspost }));
  const existing = markers.map((marker, index) => {
    const edit = vi.fn().mockResolvedValue(undefined);
    return [String(index), { id: String(index), author: { id: "bot" } as { id: string }, webhookId: null, content: "", components: [{ components: [{ content: marker }] }], edit }] as const;
  });
  const channel = {
    isSendable: () => true,
    messages: {
      fetch: vi.fn().mockImplementation((id: unknown) => typeof id === "string"
        ? Promise.resolve(existing.find(([key]) => key === id)?.[1])
        : Promise.resolve(new Collection(existing))),
    },
    send,
  };
  let imported = false;
  const records = new Map<string, ReleaseAnnouncementRecord>();
  const stored: ReleaseAnnouncementChannel = {
    isImported: vi.fn(() => Promise.resolve(imported)),
    list: vi.fn(() => Promise.resolve([...records.values()])),
    record: vi.fn((record: ReleaseAnnouncementRecord) => {
      records.set(`${record.repository}:${record.version}`, record);
      return Promise.resolve();
    }),
    markImported: vi.fn(() => { imported = true; return Promise.resolve(); }),
    reset: vi.fn((repositories: readonly string[]) => {
      imported = true;
      for (const [key, record] of records) if (repositories.includes(record.repository)) records.delete(key);
      return Promise.resolve();
    }),
  };
  const storage: ReleaseAnnouncementStorage = { withChannel: async (_channelId, task) => { await task(stored); } };
  const client = { releaseAnnouncements: storage, user: { id: "bot" }, channels: { fetch: vi.fn().mockResolvedValue(channel) } } as unknown as Client;
  return { client, send, crosspost, fetchMock, existing, channel, stored, storage, records };
}

describe("version announcements", () => {
  it("resets and resends both projects without importing the old Discord posts again", async () => {
    const { client, send, channel, stored, records } = setup(["## Arrakis Control Bot v1.0.0"]);
    records.set("other/repo:1.0.0", { repository: "other/repo", version: "1.0.0", messageId: "unrelated" });
    await replayReleaseAnnouncements(client, "announcements");
    expect(stored.reset).toHaveBeenCalledWith(["RealXKenny/Arrakis-Control-Bot", "RealXKenny/Arrakis-Control-Dashboard"]);
    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(records.has("other/repo:1.0.0")).toBe(true);
    await announceCurrentVersion(client, "announcements");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("leaves existing receipts intact if either GitHub source fails before replay", async () => {
    const { client, stored, fetchMock, send } = setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" } as Response);
    await expect(replayReleaseAnnouncements(client, "announcements")).rejects.toThrow("source is unavailable");
    expect(stored.reset).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves successful replay receipts so normal checks retry only failed sends", async () => {
    const { client, stored, send } = setup();
    send.mockRejectedValueOnce(new Error("Discord unavailable"));
    await expect(replayReleaseAnnouncements(client, "announcements")).rejects.toThrow("1 release check operation");
    await announceCurrentVersion(client, "announcements");
    expect(stored.reset).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("reports a busy channel without resetting or sending", async () => {
    const { client, stored, send } = setup();
    client.releaseAnnouncements = { withChannel: () => Promise.resolve() };
    await expect(replayReleaseAnnouncements(client, "announcements")).rejects.toThrow("holds the channel lock");
    expect(stored.reset).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("never pings roles, users, or everyone even when an announcements role is configured", async () => {
    const { client, send } = setup([], "Changes @everyone <@123456789012345678> <@&223456789012345678>");
    vi.stubEnv("ROLE_ANNOUNCEMENTS_ID", "323456789012345678");
    await announceCurrentVersion(client, "announcements");
    for (const [payload] of send.mock.calls) {
      expect(payload.allowedMentions).toEqual({ parse: [] });
      expect(JSON.stringify(payload.components)).not.toContain("<@&323456789012345678>");
    }
  });

  it("uses the configured GitHub token for both Bot and Dashboard releases", async () => {
    const { client, fetchMock } = setup();
    client.githubToken = "test-github-token";
    await announceCurrentVersion(client, "announcements");
    for (const call of fetchMock.mock.calls) {
      expect(call).toEqual([expect.stringMatching(/^https:\/\/api\.github\.com\/repos\//), expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-github-token" }),
      })]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("announces the newest release first with project links", async () => {
    const { client, send, fetchMock } = setup();
    await announceCurrentVersion(client, "announcements");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
    const cards = send.mock.calls.map(([payload]) => JSON.stringify(payload.components[0].toJSON()));
    expect(cards[0]).toContain("## Arrakis Control Dashboard v1.0.0");
    expect(cards[0]).toContain('"url":"https://github.com/RealXKenny/Arrakis-Control-Dashboard"');
    expect(cards[1]).toContain("## Arrakis Control Bot v1.0.0");
    expect(cards[1]).toContain('"url":"https://github.com/RealXKenny/Arrakis-Control-Bot"');
  });

  it("announces a bot release when the Dashboard release API fails", async () => {
    const { client, send, fetchMock } = setup();
    fetchMock.mockImplementationOnce((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ tag_name: "v1.0.0", name: "Bot release", published_at: "2026-09-21T12:00:00Z",
        body: "Changes", html_url: url.replace("api.github.com/repos/", "github.com/").replace("?per_page=100", "/tag/v1.0.0"), draft: false, prerelease: false }]),
    } as Response)).mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503, statusText: "Unavailable" } as Response));

    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("1 release check operation");

    expect(send).toHaveBeenCalledOnce();
    expect(JSON.stringify(send.mock.calls[0][0].components[0].toJSON())).toContain("## Arrakis Control Bot v1.0.0");
  });

  it("tries the next release when an announcement fails, then reports the failure", async () => {
    const { client, send } = setup();
    send.mockRejectedValueOnce(new Error("Discord rejected the first release"));

    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("1 release check operation");

    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls[1][0].components[0].toJSON())).toContain("## Arrakis Control Bot v1.0.0");
  });

  it("reports a failed check when neither GitHub release source is available", async () => {
    const { client, send, fetchMock } = setup();
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: "Unavailable" } as Response);
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("either GitHub repository");
    expect(send).not.toHaveBeenCalled();
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

  it("saves each sent message before crossposting and skips it after a restart without reading history", async () => {
    const { client, send, channel, stored, crosspost } = setup();
    await announceCurrentVersion(client, "announcements");
    expect(stored.record).toHaveBeenCalledWith({ repository: "RealXKenny/Arrakis-Control-Dashboard", version: "1.0.0", messageId: "sent-1" });
    expect(vi.mocked(stored.record).mock.invocationCallOrder[0]).toBeLessThan(crosspost.mock.invocationCallOrder[0]);
    channel.messages.fetch.mockClear();
    await announceCurrentVersion({ ...client } as Client, "announcements");
    expect(send).toHaveBeenCalledTimes(2);
    expect(channel.messages.fetch).not.toHaveBeenCalled();
  });

  it("does not send when persistence is missing or cannot be read", async () => {
    const { client, send, stored } = setup();
    await expect(announceCurrentVersion({ ...client, releaseAnnouncements: undefined } as Client, "announcements")).rejects.toThrow("DATABASE_URL");
    vi.mocked(stored.list).mockRejectedValue(new Error("database unavailable"));
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("database unavailable");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not post or finish the import if history cannot be read", async () => {
    const { client, send, channel, stored } = setup();
    channel.messages.fetch.mockRejectedValue(new Error("missing history permission"));
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("missing history permission");
    expect(stored.markImported).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("imports only this bot's own announcements", async () => {
    const { client, send, existing } = setup(["## Arrakis Control Bot v1.0.0"]);
    existing[0][1].author.id = "someone-else";
    await announceCurrentVersion(client, "announcements");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("records only successful sends and retries the failed release on the next check", async () => {
    const { client, send, stored } = setup();
    send.mockRejectedValueOnce(new Error("send failed"));
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow();
    expect(stored.record).toHaveBeenCalledTimes(1);
    await announceCurrentVersion(client, "announcements");
    expect(send).toHaveBeenCalledTimes(3);
    expect(stored.record).toHaveBeenCalledTimes(2);
  });

  it("stops sending immediately if the sent message cannot be recorded", async () => {
    const { client, send, stored, crosspost } = setup();
    vi.mocked(stored.record).mockRejectedValue(new Error("write failed"));
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("write failed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(crosspost).not.toHaveBeenCalled();
  });

  it("keeps deleted announcements recorded during refresh and never reposts them", async () => {
    const { client, send, channel } = setup(["## Arrakis Control Bot v1.0.0", "## Arrakis Control Dashboard v1.0.0"]);
    await announceCurrentVersion(client, "announcements");
    channel.messages.fetch.mockRejectedValue({ code: 10008 });
    await refreshReleaseAnnouncements(client, "announcements");
    await announceCurrentVersion(client, "announcements");
    expect(send).not.toHaveBeenCalled();
    expect(channel.messages.fetch).toHaveBeenCalledWith("0");
    expect(channel.messages.fetch).toHaveBeenCalledWith("1");
  });

  it("refreshes every existing release card with current artwork without reposting", async () => {
    const { client, send, existing } = setup(["## Arrakis Control Bot v1.0.0", "## Arrakis Control Dashboard v1.0.0"]);
    await refreshReleaseAnnouncements(client, "announcements");
    expect(send).not.toHaveBeenCalled();
    for (const [, message] of existing) {
      expect(message.edit).toHaveBeenCalledWith(expect.objectContaining({ attachments: [], files: expect.any(Array), components: expect.any(Array) }));
    }
  });

  it("publishes release messages sent to an announcement channel", async () => {
    const { client, crosspost } = setup();
    await announceCurrentVersion(client, "announcements");
    expect(crosspost).toHaveBeenCalledTimes(2);
  });

  it("keeps large release announcements below Discord's displayable text limit", async () => {
    const { client, send } = setup([], "A very large release note. ".repeat(500));

    await announceCurrentVersion(client, "announcements");

    const card = send.mock.calls.map(([payload]) => payload.components[0].toJSON())
      .find((candidate) => JSON.stringify(candidate).includes("## Arrakis Control Bot v1.0.0"))!;
    const displayableText = collectDisplayableText(card);

    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(displayableText).toContain("Release notes shortened for Discord");
    expect(displayableText).toContain("## Arrakis Control Bot v1.0.0");
  });
});

function collectDisplayableText(value: unknown): string {
  if (Array.isArray(value)) return value.map(collectDisplayableText).join("");
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  return (typeof record.content === "string" ? record.content : "") + Object.entries(record)
    .filter(([key]) => key !== "content")
    .map(([, child]) => collectDisplayableText(child))
    .join("");
}
