import type { Client } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeDashboardGuild } from "../../../src/modules/dashboard/guildAuthorization";

const guildId = "123456789012345678";
const userId = "223456789012345678";

function localClient(allowed = true) {
  const permissions = { has: vi.fn().mockReturnValue(allowed) };
  const fetchMember = vi.fn().mockResolvedValue({ id: userId, permissions });
  const fetchRoles = vi.fn().mockResolvedValue(undefined);
  const guild = { available: true, ownerId: "323456789012345678", fetch: vi.fn().mockResolvedValue(undefined),
    roles: { fetch: fetchRoles }, members: { fetch: fetchMember } };
  const client = { guilds: { cache: new Map([[guildId, guild]]) } } as unknown as Client;
  return { client, guild, fetchMember, fetchRoles, permissions };
}

afterEach(() => vi.useRealTimers());

describe("dashboard guild authorization", () => {
  it("checks fresh guild, roles and membership before allowing a manager", async () => {
    const { client, guild, fetchMember, fetchRoles, permissions } = localClient();
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("allowed");
    expect(guild.fetch).toHaveBeenCalledOnce();
    expect(fetchRoles).toHaveBeenCalledOnce();
    expect(fetchMember).toHaveBeenCalledWith({ user: userId, force: true });
    expect(permissions.has).toHaveBeenCalledWith("ManageGuild");
  });

  it("rejects invalid IDs and members without management permissions", async () => {
    const { client, fetchMember } = localClient(false);
    expect(await authorizeDashboardGuild(client, "bad", userId)).toBe("denied");
    expect(fetchMember).not.toHaveBeenCalled();
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("denied");
  });

  it("fails closed for missing members and Discord failures", async () => {
    const { client, fetchMember } = localClient();
    fetchMember.mockRejectedValueOnce({ code: 10007 }).mockRejectedValueOnce(new Error("offline"));
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("denied");
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("unavailable");
    expect(await authorizeDashboardGuild(client, "423456789012345678", userId)).toBe("unavailable");
  });

  it("routes to the owning shard and rejects failed or invalid replies", async () => {
    const { client } = localClient();
    const broadcastEval = vi.fn().mockResolvedValueOnce("allowed").mockResolvedValueOnce("wrong").mockRejectedValueOnce(new Error("offline"));
    Object.assign(client, { shard: { count: 4, broadcastEval } });
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("allowed");
    const [, options] = broadcastEval.mock.calls[0];
    expect(options).toEqual({ context: { guildId, userId }, shard: Number((BigInt(guildId) >> 22n) % 4n) });
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("unavailable");
    expect(await authorizeDashboardGuild(client, guildId, userId)).toBe("unavailable");
  });

  it("evaluates authorization on the selected shard rather than trusting the caller's guild cache", async () => {
    const caller = localClient(true).client;
    const remote = localClient(false).client;
    const broadcastEval = vi.fn().mockImplementation((fn: (client: Client, context: { guildId: string; userId: string }) => Promise<string>,
      options: { context: { guildId: string; userId: string } }) => fn(remote, options.context));
    Object.assign(caller, { shard: { count: 2, broadcastEval } });
    expect(await authorizeDashboardGuild(caller, guildId, userId)).toBe("denied");
  });

  it("bounds a stalled shard response", async () => {
    vi.useFakeTimers();
    const { client } = localClient();
    Object.assign(client, { shard: { count: 2, broadcastEval: () => new Promise(() => undefined) } });
    const pending = authorizeDashboardGuild(client, guildId, userId);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe("unavailable");
  });
});
