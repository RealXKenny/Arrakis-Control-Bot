import { ApplicationCommandType, Collection, EntryPointCommandHandlerType, type ApplicationCommandManager } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { preserveEntryPointCommand } from "../../../src/support/commands/preserveEntryPointCommand";

const entryPoint = {
  id: "900000000000000001",
  name: "launch",
  nameLocalizations: null,
  description: "Launch the poker table",
  descriptionLocalizations: null,
  type: ApplicationCommandType.PrimaryEntryPoint,
  handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
  defaultMemberPermissions: null,
  integrationTypes: [0],
  contexts: [0],
};
const poker = { id: "900000000000000002", name: "poker", type: ApplicationCommandType.ChatInput };

function setup(existing: readonly object[]) {
  const set = vi.fn((commands: readonly { name: string; type?: number }[]) => Promise.resolve(new Collection(commands.map((command, index) => [String(index), { ...command, type: command.type ?? ApplicationCommandType.ChatInput }]))));
  const fetch = vi.fn(() => Promise.resolve(new Collection(existing.map((command, index) => [String(index), command]))));
  const manager = { set, fetch } as unknown as ApplicationCommandManager;
  preserveEntryPointCommand(manager);
  return { manager, set, fetch };
}

describe("preserveEntryPointCommand", () => {
  it("adds the existing entry point to a global bulk overwrite and hides it from the result", async () => {
    const { manager, set } = setup([poker, entryPoint]);
    const result = await manager.set([{ name: "poker", description: "Open poker", type: ApplicationCommandType.ChatInput }]);
    const sent = set.mock.calls[0]![0];
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ name: "launch", type: ApplicationCommandType.PrimaryEntryPoint, handler: EntryPointCommandHandlerType.DiscordLaunchActivity, integrationTypes: [0], contexts: [0] });
    expect([...result.values()].map((command) => command.name)).toEqual(["poker"]);
  });

  it("leaves the payload alone when no entry point exists", async () => {
    const { manager, set } = setup([poker]);
    await manager.set([{ name: "poker", description: "Open poker" }]);
    expect(set.mock.calls[0]![0]).toHaveLength(1);
  });

  it("does not touch guild overwrites or fetch for them", async () => {
    const { manager, set, fetch } = setup([entryPoint]);
    await manager.set([{ name: "poker", description: "Open poker" }], "100000000000000001");
    expect(fetch).not.toHaveBeenCalled();
    expect(set.mock.calls[0]![0]).toHaveLength(1);
  });

  it("wraps a manager only once", async () => {
    const { manager, set } = setup([entryPoint]);
    preserveEntryPointCommand(manager);
    await manager.set([{ name: "poker", description: "Open poker" }]);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]![0]).toHaveLength(2);
  });
});
