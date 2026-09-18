import { Collection, ApplicationCommandType, type Client } from "discord.js";
import { expect, it, vi } from "vitest";
import { cleanupLegacyCommands } from "../../../src/support/commands/cleanupLegacyCommands";
function setup(valid = true) {
  const current = new Collection([["new", { name: valid ? "music" : "play", type: ApplicationCommandType.ChatInput }]]);
  const old = new Collection([["old", { id: "old", name: "play", type: ApplicationCommandType.ChatInput }], ["menu", { id: "menu", name: "Inspect", type: ApplicationCommandType.User }]]);
  const remove = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValueOnce(current).mockResolvedValue(old);
  const guilds = vi.fn().mockResolvedValue(new Collection([["guild", { id: "guild" }]]));
  const client = { application: { commands: { fetch, delete: remove } }, guilds: { fetch: guilds }, logger: { info: vi.fn(), warn: vi.fn() } };
  return { client: client as unknown as Client, remove, guilds, logger: client.logger };
}
it("removes obsolete guild slash commands only after the global list is confirmed", async () => {
  const fixture = setup();
  await cleanupLegacyCommands(fixture.client, new Set(["music"]));
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith("old", "guild");
  expect(fixture.logger.info).toHaveBeenCalledWith(expect.stringContaining("removed 1"));
});
it("does not delete anything if registration is incomplete", async () => {
  const fixture = setup(false);
  await cleanupLegacyCommands(fixture.client, new Set(["music"]));
  expect(fixture.remove).not.toHaveBeenCalled();
  expect(fixture.guilds).not.toHaveBeenCalled();
});
it("reports deletion failures without claiming they were removed", async () => {
  const fixture = setup();
  fixture.remove.mockRejectedValue(new Error("Forbidden"));
  await cleanupLegacyCommands(fixture.client, new Set(["music"]));
  expect(fixture.logger.warn).toHaveBeenCalledWith(expect.stringContaining("1 cleanup"));
  expect(fixture.logger.info).toHaveBeenCalledWith(expect.stringContaining("removed 0"));
});
