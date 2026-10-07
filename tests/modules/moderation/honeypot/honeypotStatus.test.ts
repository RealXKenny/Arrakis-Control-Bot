import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { handleHoneypotStatus } from "../../../../src/modules/moderation/honeypot/honeypotStatus";

function fixture(persistentStats = true) {
  const config = { guildId: "123456789012345678", channelId: "223456789012345678" };
  const stats = vi.fn().mockResolvedValue({ members: "12", messages: "15", bans: "10", timeouts: "2", logged: "1", failed: "2" });
  const editReply = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const interaction = { guildId: config.guildId, channelId: config.channelId, message: { author: { id: "bot" } }, client: { user: { id: "bot" }, honeypot: { config, stats, persistentStats } }, deferReply, editReply };
  return { interaction, stats, editReply, deferReply, run: () => handleHoneypotStatus(interaction as unknown as ButtonInteraction) };
}
describe("honeypot status button", () => {
  it("acknowledges privately before querying and displays accurate aggregate counts", async () => {
    const f = fixture(); await f.run();
    expect(f.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(f.deferReply.mock.invocationCallOrder[0]).toBeLessThan(f.stats.mock.invocationCallOrder[0]);
    const content = f.editReply.mock.calls[0][0].content as string;
    expect(content).toContain("Members caught:** 12"); expect(content).toContain("Successful bans:** 10"); expect(content).toContain("Failed moderation actions:** 2"); expect(content).toContain("preserved across restarts");
    expect(f.editReply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }));
  });
  it("labels session-only counters when no database is configured", async () => {
    const f = fixture(false); await f.run();
    expect(f.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Totals since this restart") }));
  });
  it("rejects copied controls in other channels/guilds or on other authors' messages", async () => {
    for (const change of ["guild", "channel", "author", "disabled"]) {
      const f = fixture();
      if (change === "guild") f.interaction.guildId = "other";
      if (change === "channel") f.interaction.channelId = "other";
      if (change === "author") f.interaction.message.author.id = "other";
      if (change === "disabled") Object.assign(f.interaction.client, { honeypot: undefined });
      await f.run(); expect(f.stats).not.toHaveBeenCalled();
      expect(f.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("no longer available") }));
    }
  });
  it("reports unavailable storage without inventing zero counts", async () => {
    const f = fixture(); f.stats.mockRejectedValue(new Error("Database unavailable")); await f.run();
    expect(f.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("temporarily unavailable") }));
  });
});
