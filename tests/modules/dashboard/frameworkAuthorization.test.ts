import { expect, it, vi } from "vitest";
import { FrameworkAuthorization } from "../../../src/modules/dashboard/frameworkAuthorization";

it("authorizes every request and isolates simultaneous guild sessions", async () => {
  const authorize = vi.fn((token: string | undefined, guildId: string) => Promise.resolve({
    status: "authorized" as const, userId: `${token}:${guildId}`,
  }));
  const bridge = new FrameworkAuthorization({ authorize });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const first = bridge.run("first", "guild-a", async () => {
    await wait;
    return bridge.get("untrusted-cookie");
  });
  const second = await bridge.run("second", "guild-b", () => Promise.resolve(bridge.get()));
  release();
  expect((await first)).toEqual({ status: "authorized", value: { platform: "discord", userId: "first:guild-a", spaces: [{ id: "guild-a" }] } });
  expect(second).toEqual({ status: "authorized", value: { platform: "discord", userId: "second:guild-b", spaces: [{ id: "guild-b" }] } });
  expect(bridge.get()).toBeUndefined();
  expect(authorize).toHaveBeenCalledTimes(2);
});

it.each(["unauthenticated", "forbidden", "unavailable"] as const)("does not invoke framework handlers when %s", async (status) => {
  const bridge = new FrameworkAuthorization({ authorize: () => Promise.resolve({ status }) });
  const handler = vi.fn(() => Promise.resolve("secret"));
  expect(await bridge.run("token", "guild", handler)).toEqual({ status });
  expect(handler).not.toHaveBeenCalled();
  expect(bridge.get()).toBeUndefined();
});

it("clears the request context when a framework handler throws", async () => {
  const bridge = new FrameworkAuthorization({ authorize: () => Promise.resolve({ status: "authorized", userId: "user" }) });
  await expect(bridge.run("token", "guild", () => Promise.reject(new Error("handler failed")))).rejects.toThrow("handler failed");
  expect(bridge.get()).toBeUndefined();
});
