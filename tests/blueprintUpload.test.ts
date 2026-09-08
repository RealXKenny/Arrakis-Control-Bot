import type { ModalSubmitInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { execute } from "../src/app/components/modals/blueprint-upload-modal";

describe("blueprint upload modal", () => {
  it("matches the linked pawn instead of an unrelated row with missing IDs", async () => {
    const attachment = {
      name: "base.json",
      url: "https://cdn.discordapp.com/attachments/1/2/base.json",
      size: 100,
    };
    const importBlueprint = vi.fn().mockResolvedValue({ message: "Imported" });
    const editReply = vi.fn().mockResolvedValue(undefined);

    await execute({
      id: "interaction-id",
      guildId: "guild-id",
      channelId: "channel-id",
      user: { id: "user-id", username: "user", tag: "user" },
      inGuild: () => false,
      member: null,
      client: {
        discordAdapter: {
          getCurrentPlayer: vi.fn().mockResolvedValue({
            linked: true,
            pawnId: "42",
            characterName: "Kenny",
            onlineStatus: "Offline",
          }),
        },
        duneApi: {
          call: vi.fn().mockResolvedValue({
            rows: [
              { characterName: "Unrelated", status: "Online" },
              { pawn_id: 42, characterName: "Kenny", status: "Offline", last_seen: new Date(Date.now() - 120_000).toISOString() },
            ],
          }),
          importBlueprint,
        },
        auditLogger: { blueprintImported: vi.fn().mockResolvedValue(undefined) },
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
      fields: {
        getUploadedFiles: () => ({ size: 1, first: () => attachment }),
      },
    } as unknown as ModalSubmitInteraction);

    expect(importBlueprint).toHaveBeenCalledWith("42", attachment);
    expect(editReply).toHaveBeenLastCalledWith("Imported");
  });

  it("uses a later valid offline timestamp when an earlier field is malformed", async () => {
    const importBlueprint = vi.fn().mockResolvedValue({ message: "Imported" });

    await execute({
      id: "interaction-id",
      guildId: "guild-id",
      channelId: "channel-id",
      user: { id: "user-id", username: "user", tag: "user" },
      inGuild: () => false,
      member: null,
      client: {
        discordAdapter: {
          getCurrentPlayer: vi.fn().mockResolvedValue({ linked: true, pawnId: 42, characterName: "Kenny", onlineStatus: "Offline", lastLogoutTime: "invalid" }),
        },
        duneApi: {
          call: vi.fn().mockResolvedValue({ rows: [{ pawnId: 42, status: "Offline", last_seen: new Date(Date.now() - 120_000).toISOString() }] }),
          importBlueprint,
        },
        auditLogger: { blueprintImported: vi.fn().mockResolvedValue(undefined) },
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      fields: {
        getUploadedFiles: () => ({ size: 1, first: () => ({ name: "base.json", url: "https://cdn.discordapp.com/attachments/1/2/base.json", size: 100 }) }),
      },
    } as unknown as ModalSubmitInteraction);

    expect(importBlueprint).toHaveBeenCalledOnce();
  });
});
