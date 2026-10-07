import { describe, expect, it, vi } from "vitest";
import { MessageFlags, PermissionFlagsBits, PermissionsBitField, ShardClientUtil, type Client } from "discord.js";
import { buildHoneypotPanel, ensureHoneypotPanel } from "../../../../src/modules/moderation/honeypot/honeypotPanel";
import { persistentPanelTasks } from "../../../../src/modules/administration/control/panelRefresh";
import { countComponents, countDisplayableText, DISCORD_LIMITS } from "../../../../src/shared/discord/discordLimits";
import type { HoneypotConfig } from "../../../../src/infrastructure/config/honeypot";
import { createDuneBanner } from "../../../../src/shared/discord/imageFactory";

vi.mock("../../../../src/shared/discord/imageFactory", () => ({ createDuneBanner: vi.fn(() => ({ attachment: Buffer.from("banner"), name: "honeypot-warning.png" })) }));
const config: HoneypotConfig = { guildId: "123456789012345678", channelId: "223456789012345678", logChannelId: "323456789012345678", action: "ban", timeoutMinutes: 1440 };

function fixture(existing = false) {
  const edit = vi.fn().mockResolvedValue(undefined);
  const message = { author: { id: "bot" }, components: [{ components: [{ content: "## Honeypot — Do Not Post" }] }], edit };
  const messages = existing ? [message] : [];
  const send = vi.fn().mockResolvedValue(undefined);
  const channel = { guildId: config.guildId, isSendable: () => true, messages: { fetch: vi.fn().mockImplementation(() => Promise.resolve({ find: (predicate: (message: unknown) => boolean) => messages.find(predicate) })) }, send };
  const fetch = vi.fn().mockResolvedValue(channel);
  const client = { user: { id: "bot" }, honeypot: { config: { ...config } }, guilds: { cache: new Map([[config.guildId, {}]]) }, channels: { fetch } };
  const ensure = () => ensureHoneypotPanel(client as unknown as Client);
  return { client, channel, messages, message, send, edit, fetch, ensure };
}

describe("honeypot warning panel", () => {
  it("explains the trap, consequences and support route within Discord limits", () => {
    for (const action of ["ban", "timeout", "log"] as const) {
      const panel = buildHoneypotPanel({ ...config, action }).toJSON();
      const text = JSON.stringify(panel);
      expect(text).toContain("spam trap"); expect(text).toContain("Do not send messages"); expect(text).toContain("contact staff");
      expect(text).toContain("honeypot:status"); expect(text).toContain('"label":"Status"');
      expect(countComponents(panel)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
      expect(countDisplayableText(panel)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
      if (action === "ban") expect(text).toContain("automatic ban");
      if (action === "timeout") { expect(text).toContain("1440 minutes"); expect(text).not.toContain("automatic ban"); }
      if (action === "log") expect(text).toContain("No automatic ban or timeout");
    }
  });
  it("publishes a public Components V2 panel without mentions", async () => {
    const f = fixture(); await f.ensure();
    expect(f.fetch).toHaveBeenCalledWith(config.channelId);
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, files: [expect.objectContaining({ name: "honeypot-warning.png" })] }));
  });
  it("updates the recognized bot panel to match the current action", async () => {
    const f = fixture(true); f.client.honeypot.config.action = "timeout";
    await f.ensure();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.edit).toHaveBeenCalledWith(expect.objectContaining({ content: null, embeds: [], attachments: [], flags: MessageFlags.IsComponentsV2 }));
    expect(JSON.stringify(f.edit.mock.calls[0])).toContain("1440 minutes");
  });
  it("recreates a deleted panel and coalesces concurrent publications", async () => {
    const f = fixture(true); await f.ensure(); f.messages.length = 0;
    await Promise.all([f.ensure(), f.ensure()]); expect(f.send).toHaveBeenCalledOnce();
  });
  it("skips disabled honeypots and guilds owned by other shards", async () => {
    const f = fixture(); f.client.guilds.cache.clear();
    const owner = ShardClientUtil.shardIdForGuildId(config.guildId, 2);
    Object.assign(f.client, { shard: { count: 2, ids: [1 - owner] } });
    await f.ensure(); expect(f.fetch).not.toHaveBeenCalled();
    await ensureHoneypotPanel({} as Client);
  });
  it("reports a wrong guild configuration instead of silently skipping publication", async () => {
    const f = fixture(); f.client.guilds.cache.clear();
    await expect(f.ensure()).rejects.toThrow("Check GUILD_ID");
  });
  it("publishes without artwork when Attach Files permission is absent", async () => {
    const f = fixture();
    Object.assign(f.channel, { permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]) });
    await f.ensure();
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ files: [] }));
    expect(JSON.stringify(f.send.mock.calls[0])).not.toContain("attachment://");
    expect(JSON.stringify(f.send.mock.calls[0])).toContain("honeypot:status");
  });
  it("still sends the warning and Status button if banner generation fails", async () => {
    const f = fixture(); vi.mocked(createDuneBanner).mockImplementationOnce(() => { throw new Error("Artwork unavailable"); });
    await f.ensure();
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ files: [] }));
    expect(JSON.stringify(f.send.mock.calls[0])).toContain("honeypot:status");
  });
  it("names missing channel permissions before attempting publication", async () => {
    const f = fixture(); Object.assign(f.channel, { permissionsFor: () => new PermissionsBitField([]) });
    await expect(f.ensure()).rejects.toThrow("View Channel, Send Messages, Read Message History");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("reports invalid destinations and failed publication, and permits retry", async () => {
    const f = fixture(); f.channel.guildId = "other";
    await expect(f.ensure()).rejects.toThrow("configured guild");
    f.channel.guildId = config.guildId; f.send.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(f.ensure()).rejects.toThrow("Forbidden");
    await expect(f.ensure()).resolves.toBeUndefined();
  });
  it("registers publication in startup and owner panel refresh tasks", () => {
    const f = fixture();
    expect(persistentPanelTasks(f.client as unknown as Client).map((task) => task.label)).toContain("honeypot warning panel");
  });
});
