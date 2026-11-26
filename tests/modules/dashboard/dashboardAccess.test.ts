import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { DashboardAccessService } from "../../../src/modules/dashboard/dashboardAccess";

const guildId = "123456789012345678";
const userId = "223456789012345678";
function setup() {
  const sessions = { getUserId: vi.fn().mockResolvedValue(userId), revoke: vi.fn().mockResolvedValue(undefined) };
  const member = { id: userId, permissions: { has: vi.fn().mockReturnValue(true) } };
  const guild = { available: true, ownerId: "323456789012345678", fetch: vi.fn().mockResolvedValue(undefined),
    roles: { fetch: vi.fn().mockResolvedValue(undefined) }, members: { fetch: vi.fn().mockResolvedValue(member) } };
  const client = { guilds: { cache: new Map([[guildId, guild]]) } } as unknown as Client;
  return { service: new DashboardAccessService(sessions, client), sessions, member, guild };
}

describe("dashboard request access", () => {
  it("resolves the session and rechecks guild permissions on every request", async () => {
    const { service, sessions, member, guild } = setup();
    expect(await service.authorize("token", guildId)).toEqual({ status: "authorized", userId });
    member.permissions.has.mockReturnValue(false);
    expect(await service.authorize("token", guildId)).toEqual({ status: "forbidden" });
    expect(sessions.getUserId).toHaveBeenCalledTimes(2);
    expect(guild.members.fetch).toHaveBeenCalledTimes(2);
  });

  it("fails closed for expired sessions, other guilds, and storage failures", async () => {
    const { service, sessions } = setup();
    expect(await service.authorize(undefined, guildId)).toEqual({ status: "unauthenticated" });
    sessions.getUserId.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("database offline"));
    expect(await service.authorize("token", guildId)).toEqual({ status: "unauthenticated" });
    expect(await service.authorize("token", guildId)).toEqual({ status: "unavailable" });
    expect(await service.authorize("token", "423456789012345678")).toEqual({ status: "unavailable" });
  });

  it("revokes the underlying session on logout and propagates storage failures", async () => {
    const { service, sessions } = setup();
    await service.logout("token");
    expect(sessions.revoke).toHaveBeenCalledWith("token");
    sessions.revoke.mockRejectedValueOnce(new Error("offline"));
    await expect(service.logout("token")).rejects.toThrow("offline");
  });

  it("identifies a session without granting guild access", async () => {
    const { service, guild } = setup();
    expect(await service.identify("token")).toBe(userId);
    expect(await service.identify(undefined)).toBeNull();
    expect(guild.members.fetch).not.toHaveBeenCalled();
  });
});
