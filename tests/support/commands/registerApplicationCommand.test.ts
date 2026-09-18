import { RegisterBehavior } from "@sapphire/framework";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerApplicationCommand } from "../../../src/support/commands/registerApplicationCommand";

const originalShard = process.env.DISCORD_SHARD_ID;
afterEach(() => {
  vi.unstubAllEnvs();
  if (originalShard === undefined) delete process.env.DISCORD_SHARD_ID;
  else process.env.DISCORD_SHARD_ID = originalShard;
});

describe("registerApplicationCommand", () => {
  it("registers with overwrite behavior on shard zero", () => {
    process.env.DISCORD_SHARD_ID = "0";
    const registry = { registerChatInputCommand: vi.fn() };
    const command = { name: "help", description: "Help" };
    registerApplicationCommand(registry as never, command);
    expect(registry.registerChatInputCommand).toHaveBeenCalledWith(command, { behaviorWhenNotIdentical: RegisterBehavior.Overwrite });
  });

  it("does not register duplicate global commands on secondary shards", () => {
    process.env.DISCORD_SHARD_ID = "2";
    const registry = { registerChatInputCommand: vi.fn() };
    registerApplicationCommand(registry as never, { name: "help", description: "Help" });
    expect(registry.registerChatInputCommand).not.toHaveBeenCalled();
  });
});

it("uses Discord.js SHARDS to prevent secondary-shard global registration", () => {
  vi.stubEnv("SHARDS", "1");
  vi.stubEnv("DISCORD_SHARD_ID", "0");
  const registry = { registerChatInputCommand: vi.fn() };
  registerApplicationCommand(registry as never, { name: "help", description: "Help" });
  expect(registry.registerChatInputCommand).not.toHaveBeenCalled();
});
