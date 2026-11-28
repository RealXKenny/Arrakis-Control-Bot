import { MessageFlags, PermissionsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { FEATURE_SESSION_MS, handleFeatureMenu, handleStaffStatusButton, handleStatusButton, parseReferenceUrl } from "../../../../src/modules/community/suggestions/suggestionInteractions";

function button(customId: string, staff: boolean) {
  const service = { isSuggestionThread: () => true, setStatus: vi.fn().mockResolvedValue(undefined) };
  return {
    service,
    interaction: {
      customId, user: { id: "user" }, guild: { ownerId: "owner" }, member: null,
      memberPermissions: new PermissionsBitField(staff ? PermissionsBitField.Flags.ManageThreads : 0n),
      channel: { id: "thread" }, client: { suggestions: service, logger: { error: vi.fn() } },
      reply: vi.fn().mockResolvedValue(undefined), deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("suggestion interactions", () => {
  it("rejects status buttons from non-staff without changing anything", async () => {
    const { interaction, service } = button("suggestion-status:planned", false);
    await handleStatusButton(interaction as never);
    expect(service.setStatus).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
  });

  it("acknowledges once, then applies the status for staff", async () => {
    const { interaction, service } = button("suggestion-status:not_doing", true);
    await handleStatusButton(interaction as never);
    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(service.setStatus).toHaveBeenCalledWith(interaction.channel, "not_doing", { actorId: "user" });
  });

  it("rejects unknown statuses", async () => {
    const { interaction, service } = button("suggestion-status:launch_it", true);
    await handleStatusButton(interaction as never);
    expect(service.setStatus).not.toHaveBeenCalled();
  });

  it("changes a post from the staff channel panel, and only there", async () => {
    const thread = { id: "200000000000000001" };
    const staffButton = (channelId: string, staff: boolean) => {
      const { interaction, service } = button(`suggestion-staff:implemented:${thread.id}`, staff);
      Object.assign(service, { config: { staffChannelId: "300000000000000001" } });
      Object.assign(interaction, { channelId, client: { ...interaction.client, channels: { fetch: vi.fn().mockResolvedValue(thread) } } });
      return { interaction, service };
    };
    const outside = staffButton("300000000000000002", true);
    await handleStaffStatusButton(outside.interaction as never);
    expect(outside.service.setStatus).not.toHaveBeenCalled();
    const member = staffButton("300000000000000001", false);
    await handleStaffStatusButton(member.interaction as never);
    expect(member.service.setStatus).not.toHaveBeenCalled();
    const allowed = staffButton("300000000000000001", true);
    await handleStaffStatusButton(allowed.interaction as never);
    expect(allowed.service.setStatus).toHaveBeenCalledWith(thread, "implemented", { actorId: "user" });
    expect(allowed.interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Added") }));
  });

  it("binds the feature menu to its requester and expires it", async () => {
    const linkThreads = vi.fn();
    const base = {
      customId: "suggestion-feature:9:123456789012345678", guildId: "guild", values: ["t"], guild: { ownerId: "owner" }, member: null,
      memberPermissions: new PermissionsBitField(PermissionsBitField.Flags.ManageThreads), client: { suggestions: { linkThreads }, logger: { error: vi.fn() } },
      reply: vi.fn().mockResolvedValue(undefined), deferUpdate: vi.fn(), editReply: vi.fn(), followUp: vi.fn(),
    };
    await handleFeatureMenu({ ...base, user: { id: "someone-else" }, message: { createdTimestamp: Date.now() } } as never);
    await handleFeatureMenu({ ...base, user: { id: "123456789012345678" }, message: { createdTimestamp: Date.now() - FEATURE_SESSION_MS - 1 } } as never);
    expect(linkThreads).not.toHaveBeenCalled();
    expect(base.reply).toHaveBeenCalledTimes(2);
  });

  it("accepts only https reference links", () => {
    expect(parseReferenceUrl(null)).toBeNull();
    expect(parseReferenceUrl(" https://github.com/x/y/releases/tag/v2.1.0 ")).toBe("https://github.com/x/y/releases/tag/v2.1.0");
    expect(() => parseReferenceUrl("http://example.com")).toThrow("https");
    expect(() => parseReferenceUrl("not a link")).toThrow("https");
  });
});
