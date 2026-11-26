import { MessageFlags, PermissionsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { FEATURE_SESSION_MS, handleFeatureMenu, handleStatusButton, parseReferenceUrl } from "../../../../src/modules/community/suggestions/suggestionInteractions";

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
