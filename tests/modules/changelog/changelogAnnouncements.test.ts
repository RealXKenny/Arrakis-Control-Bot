import type { ReleaseAnnouncementChannel, ReleaseAnnouncementRecord, ReleaseAnnouncementStorage } from "../../../src/infrastructure/database/releases/ReleaseAnnouncementRepository";
import { Collection, type Client } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceCurrentVersion, refreshReleaseAnnouncements, releaseType, repairReleaseAnnouncements, replayReleaseAnnouncements } from "../../../src/modules/changelog/changelogAnnouncements";
import { DISCORD_LIMITS, countDisplayableText } from "../../../src/shared/discord/discordLimits";

vi.mock("../../../src/shared/discord/imageFactory", () => ({
  createPanelBanner: () => ({ attachment: Buffer.from("banner") }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(markers: string[] = [], releaseBody = "Release changes") {
  vi.stubEnv("DISCORD_SHARD_ID", "0");
  vi.stubEnv("ROLE_ANNOUNCEMENTS_ID", "");
  const fetchMock = vi.fn().mockResolvedValue({ stale: false, releases: [
    { project: "bot", version: "1.0.0", title: "Bot release", date: "2026-09-06", sections: [{ title: "Changes", items: [releaseBody] }] },
    { project: "dashboard", version: "1.0.0", title: "Dashboard release", date: "2026-09-07", sections: [{ title: "Changes", items: [releaseBody] }] },
  ] });
  const crosspost = vi.fn().mockResolvedValue(undefined);
  let sentId = 0;
  const threads: FakeThread[] = [];
  const startThread = vi.fn((options: { name: string }) => {
    const thread = fakeThread(options.name);
    threads.push(thread);
    return Promise.resolve(thread);
  });
  const send = vi.fn().mockImplementation(() => Promise.resolve({ id: `sent-${++sentId}`, author: { id: "bot" }, webhookId: null, components: [], crosspostable: true, crosspost, thread: null, hasThread: false, startThread }));
  const existing = markers.map((marker, index) => {
    const edit = vi.fn().mockResolvedValue(undefined);
    return [String(index), { id: String(index), author: { id: "bot" } as { id: string }, webhookId: null, content: "", components: [{ components: [{ content: marker }] }], edit, thread: null, hasThread: false, startThread }] as const;
  });
  const channel = {
    isThreadOnly: () => false,
    isThread: () => false,
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
  const client = { dashboardChangelog: { origin: "https://dashboard.example", getReleases: fetchMock }, releaseAnnouncements: storage, user: { id: "bot" }, channels: { fetch: vi.fn().mockResolvedValue(channel) } } as unknown as Client;
  return { client, send, crosspost, fetchMock, existing, channel, stored, storage, records, threads, startThread };
}

type FakeMessage = { id: string; author: { id: string }; webhookId: null; createdTimestamp: number; components: { components: { content?: string }[] }[]; edit: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
type FakeThread = ReturnType<typeof fakeThread>;

let createdAt = 0;
/** A thread that stores the notes messages sent to it, so repeated syncs can be checked for duplicates. */
function fakeThread(name: string) {
  const posted: FakeMessage[] = [];
  const toMessage = (payload: { components: { toJSON(): unknown }[] }): FakeMessage["components"] => payload.components.map((card) => card.toJSON() as { components: { content?: string }[] });
  const thread = {
    name,
    archived: false,
    appliedTags: [] as string[],
    posted,
    isThread: () => true,
    setArchived: vi.fn((archived: boolean) => { thread.archived = archived; return Promise.resolve(thread); }),
    setAppliedTags: vi.fn((tags: string[]) => { thread.appliedTags = tags; return Promise.resolve(thread); }),
    send: vi.fn((payload: { components: { toJSON(): unknown }[] }) => {
      const message: FakeMessage = {
        id: `${name}-${posted.length + 1}`, author: { id: "bot" }, webhookId: null, createdTimestamp: ++createdAt, components: toMessage(payload),
        edit: vi.fn((next: { components: { toJSON(): unknown }[] }) => { message.components = toMessage(next); return Promise.resolve(message); }),
        delete: vi.fn(() => { posted.splice(posted.indexOf(message), 1); return Promise.resolve(message); }),
      };
      posted.push(message);
      return Promise.resolve(message);
    }),
    messages: { fetch: vi.fn(() => Promise.resolve(new Collection(posted.map((message) => [message.id, message] as const)))) },
  };
  return thread;
}

describe("version announcements", () => {
  it("resets and resends both projects without importing the old Discord posts again", async () => {
    const { client, send, channel, stored, records, fetchMock } = setup(["## Arrakis Control Bot v1.0.0"]);
    records.set("other/repo:1.0.0", { repository: "other/repo", version: "1.0.0", messageId: "unrelated" });
    await replayReleaseAnnouncements(client, "announcements");
    expect(fetchMock).toHaveBeenCalledWith(true);
    expect(stored.reset).toHaveBeenCalledWith(["RealXKenny/Arrakis-Control-Bot", "RealXKenny/Arrakis-Control-Dashboard"]);
    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(records.has("other/repo:1.0.0")).toBe(true);
    await announceCurrentVersion(client, "announcements");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("leaves existing receipts intact if the dashboard is unavailable before replay", async () => {
    const { client, stored, fetchMock, send } = setup();
    fetchMock.mockRejectedValueOnce(new Error("dashboard unavailable"));
    await expect(replayReleaseAnnouncements(client, "announcements")).rejects.toThrow("dashboard unavailable");
    expect(stored.reset).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("never resets receipts or posts from stale dashboard data", async () => {
    const { client, stored, fetchMock, send } = setup();
    fetchMock.mockResolvedValue({ stale: true, releases: [] });
    await expect(replayReleaseAnnouncements(client, "announcements")).rejects.toThrow("stale");
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("stale");
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

  it("loads both projects from the dashboard client", async () => {
    const { client, fetchMock } = setup();
    await announceCurrentVersion(client, "announcements");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("announces the bot release before the dashboard even when the dashboard release is newer", async () => {
    const { client, send, fetchMock } = setup();
    await announceCurrentVersion(client, "announcements");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
    const cards = send.mock.calls.map(([payload]) => JSON.stringify(payload.components[0].toJSON()));
    expect(cards[0]).toContain("## Arrakis Control Bot v1.0.0");
    expect(cards[0]).toContain('"url":"https://github.com/RealXKenny/Arrakis-Control-Bot"');
    expect(cards[1]).toContain("## Arrakis Control Dashboard v1.0.0");
    expect(cards[1]).toContain('"url":"https://github.com/RealXKenny/Arrakis-Control-Dashboard"');
  });

  it("does not announce when a project is missing", async () => {
    const { client, send, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce({ stale: false, releases: [{ project: "bot" }] });
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("missing a project");
    expect(send).not.toHaveBeenCalled();
  });

  it("tries the next release when an announcement fails, then reports the failure", async () => {
    const { client, send } = setup();
    send.mockRejectedValueOnce(new Error("Discord rejected the first release"));

    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("1 release check operation");

    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls[1][0].components[0].toJSON())).toContain("## Arrakis Control Dashboard v1.0.0");
  });

  it("reports a failed check when dashboard release information is unavailable", async () => {
    const { client, send, fetchMock } = setup();
    fetchMock.mockRejectedValue(new Error("dashboard unavailable"));
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("dashboard unavailable");
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
    expect(stored.record).toHaveBeenCalledWith({ repository: "RealXKenny/Arrakis-Control-Bot", version: "1.0.0", messageId: "sent-1" });
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

  it("fails closed when announcement history reaches the import limit", async () => {
    const { client, send, channel, stored } = setup();
    const page = new Collection(Array.from({ length: 100 }, (_, index) => [String(index), { id: String(index) }] as const));
    channel.messages.fetch.mockResolvedValue(page);
    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("10,000-message import limit");
    expect(channel.messages.fetch).toHaveBeenCalledTimes(100);
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

  it("posts a short announcement and the full notes of a long release in its thread, bot first, each part under the limit", async () => {
    const { client, send, stored, crosspost, threads } = setup([], "A very large release note. ".repeat(2_000));

    await announceCurrentVersion(client, "announcements");

    // The channel gets exactly one short announcement per release, bot first.
    expect(send).toHaveBeenCalledTimes(2);
    const announcements = send.mock.calls.map(([payload]) => collectDisplayableText(payload.components[0].toJSON()));
    expect(announcements[0]).toContain("## Arrakis Control Bot v1.0.0");
    expect(announcements[1]).toContain("## Arrakis Control Dashboard v1.0.0");
    for (const text of announcements) {
      expect(text).toContain("Full release notes are in the thread below.");
      expect(text).not.toContain("very large release note");
    }
    expect(threads.map((thread) => thread.name)).toEqual(["Bot v1.0.0 release notes", "Dashboard v1.0.0 release notes"]);
    const parts = threads[0].posted.map((message) => message.components[0]);
    const texts = parts.map(collectDisplayableText);
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) expect(countDisplayableText(part)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    for (const [index, text] of texts.entries()) {
      expect(text).toMatch(new RegExp(`^-# Bot v1\\.0\\.0 release notes, part ${index + 1} of ${texts.length}`));
      expect(text).not.toContain("## Arrakis Control");
    }
    expect(texts.join("")).not.toContain("Release notes shortened for Discord");
    // Every word of the very long notes survives, in order across the parts.
    expect(texts.join(" ").match(/\blarge\b/g)).toHaveLength(2_000);
    // One receipt per release pointing at the announcement; only announcements are published.
    expect(stored.record).toHaveBeenNthCalledWith(1, { repository: "RealXKenny/Arrakis-Control-Bot", version: "1.0.0", messageId: "sent-1" });
    expect(stored.record).toHaveBeenCalledTimes(2);
    expect(crosspost).toHaveBeenCalledTimes(2);
  });

  it("finishes a notes thread that failed part-way on the next repair, without reposting or duplicating", async () => {
    const { client, send, stored, threads, channel } = setup([], "A very large release note. ".repeat(1_000));
    let failNext = true;
    const startThread = send.getMockImplementation()!;
    send.mockImplementation(async (payload: unknown) => {
      const message = await startThread(payload);
      const realStart = message.startThread;
      message.startThread = async (options: { name: string }) => {
        const thread = await realStart(options);
        const realSend = thread.send.getMockImplementation()!;
        thread.send.mockImplementation((part: never) => {
          if (failNext && thread.posted.length === 1) { failNext = false; return Promise.reject(new Error("notes rejected")); }
          return realSend(part);
        });
        return thread;
      };
      return message;
    });

    await expect(announceCurrentVersion(client, "announcements")).rejects.toThrow("1 release check operation");
    expect(stored.record).toHaveBeenCalledTimes(2);
    const botThread = threads[0];
    expect(botThread.posted).toHaveLength(1);

    // The repair runs against the recorded announcement and completes only the missing parts.
    const announcement = await send.mock.results[0].value;
    announcement.thread = botThread;
    channel.messages.fetch.mockImplementation((id: unknown) => Promise.resolve(id === "sent-1" ? announcement : { ...announcement, id, thread: threads[1] }));
    await repairReleaseAnnouncements(client, "announcements");
    const complete = botThread.posted.length;
    expect(complete).toBeGreaterThan(1);
    await repairReleaseAnnouncements(client, "announcements");
    expect(botThread.posted).toHaveLength(complete);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("moves notes out of an old cut-off announcement into a thread once, and leaves correct posts alone", async () => {
    const { client, send, existing, threads } = setup(["## Arrakis Control Bot v1.0.0", "## Arrakis Control Dashboard v1.0.0"]);
    Object.assign(existing[0][1], { components: [{ components: [{ content: "## Arrakis Control Bot v1.0.0" }, { content: "### What changed" }] }] });
    await repairReleaseAnnouncements(client, "announcements");
    expect(existing[0][1].edit).toHaveBeenCalledOnce();
    expect(existing[1][1].edit).not.toHaveBeenCalled();
    expect(threads).toHaveLength(2);
    for (const thread of threads) expect(thread.posted).toHaveLength(1);
    for (const [index, [, message]] of existing.entries()) Object.assign(message, { thread: threads[index], components: [{ components: [{ content: index === 0 ? "## Arrakis Control Bot v1.0.0" : "## Arrakis Control Dashboard v1.0.0" }] }] });
    await repairReleaseAnnouncements(client, "announcements");
    expect(threads).toHaveLength(2);
    for (const thread of threads) {
      expect(thread.posted).toHaveLength(1);
      expect(thread.send).toHaveBeenCalledOnce();
    }
    expect(existing[0][1].edit).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("edits changed parts and removes surplus parts instead of posting duplicates", async () => {
    const { client, existing, threads, fetchMock } = setup(["## Arrakis Control Bot v1.0.0", "## Arrakis Control Dashboard v1.0.0"], "A very large release note. ".repeat(1_000));
    await repairReleaseAnnouncements(client, "announcements");
    const botThread = threads[0];
    const before = botThread.posted.length;
    Object.assign(existing[0][1], { thread: botThread });
    Object.assign(existing[1][1], { thread: threads[1] });
    fetchMock.mockResolvedValue({ stale: false, releases: [
      { project: "bot", version: "1.0.0", title: "Bot release", date: "2026-09-06", sections: [{ title: "Changes", items: ["Now short"] }] },
      { project: "dashboard", version: "1.0.0", title: "Dashboard release", date: "2026-09-07", sections: [{ title: "Changes", items: ["Now short"] }] },
    ] });
    await repairReleaseAnnouncements(client, "announcements");
    expect(botThread.posted).toHaveLength(1);
    expect(botThread.send).toHaveBeenCalledTimes(before);
    expect(collectDisplayableText(botThread.posted[0].components[0])).toContain("Now short");
  });

  it("uses one forum post per release with product and release-type tags, creating missing tags once", async () => {
    const { client, stored } = setup();
    const posts: FakeThread[] = [];
    const forum = {
      isThreadOnly: () => true,
      availableTags: [{ id: "t-bot", name: "bot", moderated: false, emoji: null }] as { id: string; name: string; moderated: boolean; emoji: null }[],
      setAvailableTags: vi.fn((tags: { id?: string; name: string }[]) => {
        forum.availableTags = tags.map((tag, index) => ({ id: tag.id ?? `t-new-${index}`, name: tag.name, moderated: false, emoji: null }));
        return Promise.resolve(forum);
      }),
      threads: {
        create: vi.fn((options: { name: string; appliedTags: string[]; message: unknown }) => {
          const thread = fakeThread(options.name);
          thread.appliedTags = options.appliedTags;
          const starter = { id: `post-${posts.length + 1}`, author: { id: "bot" }, webhookId: null, components: [], crosspostable: false, channel: thread };
          Object.assign(thread, { fetchStarterMessage: () => Promise.resolve(starter) });
          posts.push(thread);
          return Promise.resolve(thread);
        }),
        fetch: vi.fn((id: string) => Promise.resolve(posts[Number(id.split("-")[1]) - 1])),
      },
    };
    vi.mocked(client.channels.fetch).mockResolvedValue(forum as never);

    await announceCurrentVersion(client, "announcements");
    await repairReleaseAnnouncements(client, "announcements");

    expect(forum.setAvailableTags).toHaveBeenCalledOnce();
    expect(forum.availableTags.map((tag) => tag.name)).toEqual(["bot", "Dashboard", "Major", "Minor", "Patch"]);
    expect(posts.map((post) => post.name)).toEqual(["Bot v1.0.0 release notes", "Dashboard v1.0.0 release notes"]);
    const id = (name: string) => forum.availableTags.find((tag) => tag.name === name)!.id;
    expect(posts[0].appliedTags).toEqual([id("bot"), id("Major")]);
    expect(posts[1].appliedTags).toEqual([id("Dashboard"), id("Major")]);
    for (const post of posts) expect(post.posted).toHaveLength(1);
    expect(stored.record).toHaveBeenNthCalledWith(1, { repository: "RealXKenny/Arrakis-Control-Bot", version: "1.0.0", messageId: "post-1" });
  });

  it("classifies release types from the version", () => {
    expect(releaseType("2.0.0")).toBe("Major");
    expect(releaseType("2.1.0")).toBe("Minor");
    expect(releaseType("2.0.1")).toBe("Patch");
    expect(releaseType("next")).toBeNull();
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
