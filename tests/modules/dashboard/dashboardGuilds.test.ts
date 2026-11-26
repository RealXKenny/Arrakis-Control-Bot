import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { listDashboardGuilds, listDashboardResources } from "../../../src/modules/dashboard/dashboardGuilds";

const user = "223456789012345678";
const owner = "323456789012345678";
function guild(id: string, name: string, manage: boolean) {
  return {
    id, name, icon: null, available: true, ownerId: owner,
    members: { fetch: vi.fn().mockResolvedValue({ id: user, permissions: { has: () => manage } }), me: { roles: { highest: { position: 5 } } } },
    channels: { cache: new Map([
      ["423456789012345678", { id: "423456789012345678", name: "general", type: 0, nsfw: false }],
      ["523456789012345678", { id: "523456789012345678", name: "after-dark", type: 0, nsfw: true }],
      ["623456789012345678", { id: "623456789012345678", name: "Voice", type: 2 }],
    ]) },
    roles: { cache: new Map([
      [id, { id, name: "@everyone", managed: false, position: 0 }],
      ["723456789012345678", { id: "723456789012345678", name: "Bot", managed: true, position: 1 }],
      ["823456789012345678", { id: "823456789012345678", name: "Member", managed: false, position: 2 }],
      ["923456789012345678", { id: "923456789012345678", name: "Admin", managed: false, position: 9 }],
    ]) },
  };
}

describe("dashboard guild listing", () => {
  it("lists only guilds the user manages, sorted by name", async () => {
    const managed = guild("123456789012345678", "Sietch", true);
    const other = guild("133456789012345678", "Arrakeen", false);
    const missing = guild("143456789012345678", "Carthag", true);
    missing.members.fetch.mockRejectedValueOnce({ code: 10007 });
    const client = { guilds: { cache: new Map([[managed.id, managed], [other.id, other], [missing.id, missing]]) } } as unknown as Client;
    expect(await listDashboardGuilds(client, user)).toEqual([{ id: managed.id, name: "Sietch", icon: null }]);
    expect(await listDashboardGuilds(client, "bad")).toEqual([]);
  });

  it("merges every shard and fails closed when a shard does not answer", async () => {
    const broadcastEval = vi.fn().mockResolvedValueOnce([[{ id: "123456789012345678", name: "B", icon: null }], [{ id: "133456789012345678", name: "A", icon: "x" }, { id: "evil", name: 1 }]])
      .mockRejectedValueOnce(new Error("shard down"));
    const client = { shard: { broadcastEval, count: 2 } } as unknown as Client;
    expect((await listDashboardGuilds(client, user))?.map((entry) => entry.name)).toEqual(["A", "B"]);
    expect(await listDashboardGuilds(client, user)).toBeNull();
  });
});

describe("dashboard guild resources", () => {
  it("filters channels and roles like the framework pickers", async () => {
    const local = guild("123456789012345678", "Sietch", true);
    const client = { guilds: { cache: new Map([[local.id, local]]) } } as unknown as Client;
    expect((await listDashboardResources(client, local.id, "channel", { types: ["text"], hideNsfw: true })).map((o) => o.label)).toEqual(["general"]);
    expect((await listDashboardResources(client, local.id, "role", { hideHigher: true })).map((o) => o.label)).toEqual(["Member"]);
    await expect(listDashboardResources(client, "153456789012345678", "role")).rejects.toThrow("unavailable");
  });

  it("asks only the owning shard and drops malformed options", async () => {
    const broadcastEval = vi.fn().mockResolvedValue([{ label: "general", value: "423456789012345678" }, { label: "x", value: "bad" }]);
    const client = { shard: { broadcastEval, count: 4 } } as unknown as Client;
    expect(await listDashboardResources(client, "123456789012345678", "channel", { types: ["text", "bogus"] })).toEqual([{ label: "general", value: "423456789012345678" }]);
    expect(broadcastEval).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ shard: expect.any(Number),
      context: expect.objectContaining({ filter: expect.objectContaining({ types: ["text"] }) }) }));
  });
});
