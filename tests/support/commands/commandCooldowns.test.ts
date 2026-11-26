import { expect, it } from "vitest";

import { CommandCooldowns, cooldownMessage } from "../../../src/support/commands/commandCooldowns";

it("cools down expensive commands per user and leaves others alone", () => {
  const cooldowns = new CommandCooldowns();
  expect(cooldowns.take("u1", "status", 0)).toBe(0);
  expect(cooldowns.take("u1", "status", 4_000)).toBe(6_000);
  expect(cooldowns.take("u2", "status", 4_000)).toBe(0);
  expect(cooldowns.take("u1", "status", 10_000)).toBe(0);
  expect(cooldowns.take("u1", "ping", 0)).toBe(0);
  expect(cooldowns.take("u1", "ping", 1)).toBe(0);
});

it("stays bounded", () => {
  const cooldowns = new CommandCooldowns(2);
  cooldowns.take("a", "status", 0);
  cooldowns.take("b", "status", 0);
  cooldowns.take("c", "status", 0);
  expect(cooldowns.size).toBe(2);
});

it("says how long to wait", () => {
  expect(cooldownMessage(5_200)).toBe("That command is cooling down. Try again in 6 seconds.");
});
