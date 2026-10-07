import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, Message } from "discord.js";
import { HoneypotService } from "../../../../src/modules/moderation/honeypot/HoneypotService";
import type { HoneypotConfig } from "../../../../src/infrastructure/config/honeypot";

vi.mock("../../../../src/client/logger", () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));

const config: HoneypotConfig = { guildId: "123456789012345678", channelId: "223456789012345678", logChannelId: "323456789012345678", action: "ban", timeoutMinutes: 1440 };
function fixture(action: HoneypotConfig["action"] = "ban") {
  const member = { id: "423456789012345678", roles: { cache: new Map<string, unknown>() }, permissions: { any: vi.fn().mockReturnValue(false) }, bannable: true, moderatable: true, communicationDisabledUntilTimestamp: null as number | null, ban: vi.fn().mockResolvedValue(undefined), timeout: vi.fn().mockResolvedValue(undefined) };
  const fetchMember = vi.fn().mockResolvedValue(member);
  const send = vi.fn().mockResolvedValue(undefined);
  const channel = { guildId: config.guildId, isSendable: () => true, send };
  const fetchChannel = vi.fn().mockResolvedValue(channel);
  const message = { id: "523456789012345678", guildId: config.guildId, channelId: config.channelId, guild: { ownerId: "623456789012345678", members: { fetch: fetchMember } }, author: { id: member.id, bot: false }, webhookId: null, system: false, delete: vi.fn().mockResolvedValue(undefined) };
  const service = new HoneypotService({ channels: { fetch: fetchChannel } } as unknown as Client, { ...config, action });
  const handle = () => service.handleMessage(message as unknown as Message);
  return { service, message, member, channel, fetchMember, fetchChannel, send, handle };
}

afterEach(() => vi.unstubAllEnvs());
describe("honeypot moderation", () => {
  it("deletes a trap message, bans the current member, and logs without mentions", async () => {
    const f = fixture();
    await f.handle();
    expect(f.fetchMember).toHaveBeenCalledWith({ user: f.member.id, force: true });
    expect(f.message.delete).toHaveBeenCalledOnce();
    expect(f.member.ban).toHaveBeenCalledWith({ reason: expect.stringContaining(f.message.id), deleteMessageSeconds: 0 });
    expect(f.send).toHaveBeenCalledWith({ content: expect.stringContaining("Member banned."), allowedMentions: { parse: [] } });
  });
  it("ignores other channels, guilds, DMs, bots, webhooks and system messages", async () => {
    for (const change of [{ channelId: "other" }, { guildId: "other" }, { guild: null }, { author: { id: "bot", bot: true } }, { webhookId: "webhook" }, { system: true }]) {
      const f = fixture();
      Object.assign(f.message, change);
      await f.handle();
      expect(f.fetchMember).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
    }
  });
  it("exempts the owner, configured staff, and members with moderation permissions", async () => {
    for (const exemption of ["owner", "staff", "permissions"]) {
      const f = fixture();
      if (exemption === "owner") f.message.guild.ownerId = f.member.id;
      if (exemption === "staff") { vi.stubEnv("MODERATOR_ROLE_ID", "723456789012345678"); f.member.roles.cache.set("723456789012345678", {}); }
      if (exemption === "permissions") f.member.permissions.any.mockReturnValue(true);
      await f.handle();
      expect(f.message.delete).not.toHaveBeenCalled();
      expect(f.member.ban).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
    }
  });
  it("does not punish an unresolved member and reports the failure", async () => {
    const f = fixture(); f.fetchMember.mockRejectedValue(new Error("Unavailable"));
    await f.handle();
    expect(f.member.ban).not.toHaveBeenCalled();
    expect(f.message.delete).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("unable to resolve") }));
  });
  it("continues to ban after deletion failure and accurately logs sanction failure", async () => {
    const f = fixture(); f.message.delete.mockRejectedValue(new Error("Forbidden")); f.member.ban.mockRejectedValue(new Error("Forbidden"));
    await f.handle();
    expect(f.member.ban).toHaveBeenCalledOnce();
    const content = f.send.mock.calls[0][0].content as string;
    expect(content).toContain("deletion failed"); expect(content).toContain("ban failed"); expect(content).not.toContain("Member banned.");
  });
  it("respects role hierarchy without attempting a ban", async () => {
    const f = fixture(); f.member.bannable = false;
    await f.handle();
    expect(f.member.ban).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("ban failed") }));
  });
  it("supports timeouts without shortening an existing longer timeout", async () => {
    const f = fixture("timeout"); await f.handle();
    expect(f.member.timeout).toHaveBeenCalledWith(86400000, expect.any(String));
    const longer = fixture("timeout"); longer.member.communicationDisabledUntilTimestamp = Date.now() + 172800000;
    await longer.handle(); expect(longer.member.timeout).not.toHaveBeenCalled();
    const denied = fixture("timeout"); denied.member.moderatable = false;
    await denied.handle(); expect(denied.member.timeout).not.toHaveBeenCalled();
    expect(denied.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("timeout failed") }));
  });
  it("supports log mode with message removal and no member sanction", async () => {
    const f = fixture("log"); await f.handle();
    expect(f.message.delete).toHaveBeenCalledOnce(); expect(f.member.ban).not.toHaveBeenCalled(); expect(f.member.timeout).not.toHaveBeenCalled();
  });
  it("suppresses duplicate delivery and simultaneous sanctions against the same member", async () => {
    const f = fixture();
    await Promise.all([f.handle(), f.service.handleMessage({ ...f.message, id: "823456789012345678" } as unknown as Message)]);
    await f.handle();
    expect(f.member.ban).toHaveBeenCalledOnce();
  });
  it("handles missing log channels, wrong guilds and send failures safely", async () => {
    for (const mode of ["missing", "wrong-guild", "send-failure"]) {
      const f = fixture();
      if (mode === "missing") f.fetchChannel.mockResolvedValue(null);
      if (mode === "wrong-guild") f.channel.guildId = "other";
      if (mode === "send-failure") f.send.mockRejectedValue(new Error("Forbidden"));
      await expect(f.handle()).resolves.toBeUndefined();
      expect(f.member.ban).toHaveBeenCalledOnce();
      if (mode !== "send-failure") expect(f.send).not.toHaveBeenCalled();
    }
  });
});
