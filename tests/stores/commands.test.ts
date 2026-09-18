import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { execute as executeKick } from "../../src/commands/moderation/members/kick";
import { reloadPieces } from "../../src/commands/administration/operations/reload";
import { PLAYER_ADMIN_COMMAND_NAMES } from "../../src/support/commands/playerAdminCommandFactory";
import { canModerateMember } from "../../src/support/access/staffAccess";
import { getStoreSnapshot } from "../helpers/storeSnapshot";

afterEach(() => {
  delete process.env.MODERATOR_ROLE_ID;
});

describe("moderation commands", () => {
  it("blocks self-moderation, the guild owner, and equal or higher roles", () => {
    expect(canModerateMember(createMember("actor", 1), createMember("actor", 0), "owner")).toBe(false);
    expect(canModerateMember(createMember("actor", 1), createMember("owner", 0), "owner")).toBe(false);
    expect(canModerateMember(createMember("actor", 0), createMember("peer", 0), "owner")).toBe(false);
    expect(canModerateMember(createMember("actor", -1), createMember("senior", 0), "owner")).toBe(false);
    expect(canModerateMember(createMember("actor", 1), createMember("junior", 0), "owner")).toBe(true);
  });

  it("allows the guild owner to moderate other members", () => {
    expect(canModerateMember(createMember("owner", -1), createMember("member", -1), "owner")).toBe(true);
  });

  it("does not let a non-staff user run the kick command", async () => {
    process.env.MODERATOR_ROLE_ID = "staff-role";

    const fetchMember = vi.fn().mockResolvedValue({
      roles: { cache: { has: () => false } },
    });
    const getUser = vi.fn();
    const reply = vi.fn().mockResolvedValue(undefined);

    await executeKick(
      createKickInteraction({
        fetchMember,
        getUser,
        reply,
      }),
    );

    expect(fetchMember).toHaveBeenCalledOnce();
    expect(fetchMember).toHaveBeenCalledWith("requesting-user");
    expect(getUser).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledOnce();
  });

  it("checks the requesting member before kicking the target", async () => {
    process.env.MODERATOR_ROLE_ID = "staff-role";

    const kick = vi.fn().mockResolvedValue(undefined);
    const fetchMember = vi
      .fn()
      .mockResolvedValueOnce({
        id: "requesting-user",
        roles: {
          cache: { has: (roleId: string) => roleId === "staff-role" },
          highest: { comparePositionTo: () => 1 },
        },
      })
      .mockResolvedValueOnce({ id: "target-user", roles: { highest: {} }, kickable: true, kick });
    const getUser = vi.fn().mockReturnValue({ id: "target-user", tag: "Target" });

    await executeKick(
      createKickInteraction({
        fetchMember,
        getUser,
        reply: vi.fn().mockResolvedValue(undefined),
      }),
    );

    expect(fetchMember).toHaveBeenNthCalledWith(1, "requesting-user");
    expect(fetchMember).toHaveBeenNthCalledWith(2, "target-user");
    expect(kick).toHaveBeenCalledWith("Kicked by Moderator");
  });
});

describe("Sapphire command store", () => {
  it("discovers all 79 commands without a gateway login", async () => {
    const { commands } = await getStoreSnapshot();
    expect(commands).toEqual(expect.arrayContaining(["music", "voice", "help", "reload", "info", "ping", "purge", "userinfo", "ban", "kick", "timeout", "players", "profile", ...Object.values(PLAYER_ADMIN_COMMAND_NAMES), "backups", "create-backup", "restore-backup", "download-backup", "delete-backup", "delete-all-backups", "import-backup", "configure-auto-backup", "market", "start-server", "stop-server", "restart-server", "fix-network", "cleanup-images", "cleanup-build-cache", "services", "restart-service", "check-game-update", "apply-game-update", "fix-steamcmd", "check-stack-update", "apply-stack-update", "auto-update-status", "configure-auto-update", "repair-runtime", "servers", "status", "storm"]));
    expect(commands).toHaveLength(79);
  });

  it("reports the native Sapphire reload count", async () => {
    const pieces = [{ reload: vi.fn().mockResolvedValue(undefined) }, { reload: vi.fn().mockResolvedValue(undefined) }];
    await expect(reloadPieces(pieces)).resolves.toBe(2);
    expect(pieces[0].reload).toHaveBeenCalledOnce();
    expect(pieces[1].reload).toHaveBeenCalledOnce();
  });
});

function createMember(id: string, comparison: number): GuildMember {
  return {
    id,
    roles: {
      highest: {
        comparePositionTo: () => comparison,
      },
    },
  } as unknown as GuildMember;
}

function createKickInteraction(options: {
  fetchMember: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
}): ChatInputCommandInteraction {
  return {
    inGuild: () => true,
    guild: { ownerId: "guild-owner", members: { fetch: options.fetchMember } },
    user: { id: "requesting-user", tag: "Moderator" },
    options: {
      getUser: options.getUser,
      getString: () => null,
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: options.reply,
  } as unknown as ChatInputCommandInteraction;
}
