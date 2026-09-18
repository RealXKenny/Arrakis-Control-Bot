import { afterEach, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { GROUPED_ACTIONS } from "../../src/support/commands/groupedCommandCatalog";
import { executeGroupedCommand, groupedCommandDefinition } from "../../src/support/commands/groupedCommandFactory";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("registers all 74 migrated actions exactly once with unchanged options within Discord limits", () => {
  let count = 0;
  for (const group of new Set(GROUPED_ACTIONS.map((action) => action.group))) {
    const data = groupedCommandDefinition(group).toJSON();
    expect(data.options!.length).toBeLessThanOrEqual(25);
    for (const action of GROUPED_ACTIONS.filter((action) => action.group === group)) {
      const parent = action.subgroup ? data.options!.find((option) => option.name === action.subgroup) : undefined;
      const children = parent && "options" in parent ? parent.options! : data.options!;
      expect(children.length).toBeLessThanOrEqual(25);
      const matches = children.filter((option) => option.name === action.name);
      expect(matches).toHaveLength(1);
      expect(("options" in matches[0] ? matches[0].options : []) ?? []).toEqual(action.data.toJSON().options ?? []);
      count++;
    }
  }
  expect(count).toBe(74);
});

it.each(GROUPED_ACTIONS.filter((action) => action.access !== "Everyone"))("enforces $access access for $legacy before invoking it", async (action) => {
  vi.stubEnv("OWNER_ROLE_ID", "owner-role");
  const execute = vi.spyOn(action, "execute").mockResolvedValue(undefined);
  const reply = vi.fn();
  const interaction = { options: { getSubcommand: () => action.name, getSubcommandGroup: () => action.subgroup },
    user: { id: "user" }, guild: { members: { fetch: vi.fn().mockResolvedValue({ roles: { cache: new Map() } }) } }, reply };
  await executeGroupedCommand(action.group, interaction as unknown as ChatInputCommandInteraction);
  expect(execute).not.toHaveBeenCalled();
  expect(reply).toHaveBeenCalledOnce();
});

it("dispatches the authorized subcommand with the original interaction options", async () => {
  vi.stubEnv("OWNER_ROLE_ID", "owner-role");
  const action = GROUPED_ACTIONS.find((action) => action.legacy === "restore-backup")!;
  const execute = vi.spyOn(action, "execute").mockResolvedValue(undefined);
  const interaction = { options: { getSubcommand: () => "restore", getSubcommandGroup: () => null },
    user: { id: "user" }, guild: { members: { fetch: vi.fn().mockResolvedValue({ roles: { cache: new Map([["owner-role", {}]]) } }) } } };
  await executeGroupedCommand("backup", interaction as unknown as ChatInputCommandInteraction);
  expect(execute).toHaveBeenCalledWith(interaction);
});

it("keeps public server status accessible without the owner role", async () => {
  const action = GROUPED_ACTIONS.find((action) => action.legacy === "status")!;
  const execute = vi.spyOn(action, "execute").mockResolvedValue(undefined);
  const interaction = { options: { getSubcommand: () => "status", getSubcommandGroup: () => null } };
  await executeGroupedCommand("server", interaction as unknown as ChatInputCommandInteraction);
  expect(execute).toHaveBeenCalledWith(interaction);
});
