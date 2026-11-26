import { expect, it, vi } from "vitest";
import { FrameworkAuthorization } from "../../../src/modules/dashboard/frameworkAuthorization";

it("authorizes every request and isolates simultaneous guild grants", async () => {
  const authorize = vi.fn((token: string | undefined, guildId: string) => Promise.resolve({
    status: "authorized" as const, userId: `${token}:${guildId}`,
  }));
  const bridge = new FrameworkAuthorization({ authorize });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let firstGrant = "";
  const first = bridge.run("first", "guild-a", async (grant) => {
    firstGrant = grant;
    await wait;
    return bridge.get(grant);
  });
  const second = await bridge.run("second", "guild-b", (grant) => Promise.resolve(bridge.get(grant)));
  expect(bridge.get("untrusted-cookie")).toBeUndefined();
  release();
  expect(await first).toEqual({ status: "authorized", userId: "first:guild-a", value: { platform: "discord", userId: "first:guild-a", spaces: [{ id: "guild-a" }] } });
  expect(second).toEqual({ status: "authorized", userId: "second:guild-b", value: { platform: "discord", userId: "second:guild-b", spaces: [{ id: "guild-b" }] } });
  expect(firstGrant).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(bridge.get(firstGrant)).toBeUndefined();
  expect(bridge.get()).toBeUndefined();
  expect(authorize).toHaveBeenCalledTimes(2);
});

it.each(["unauthenticated", "forbidden", "unavailable"] as const)("does not invoke framework handlers when %s", async (status) => {
  const bridge = new FrameworkAuthorization({ authorize: () => Promise.resolve({ status }) });
  const handler = vi.fn(() => Promise.resolve("secret"));
  expect(await bridge.run("token", "guild", handler)).toEqual({ status });
  expect(handler).not.toHaveBeenCalled();
});

it("revokes the grant when a framework handler throws", async () => {
  const bridge = new FrameworkAuthorization({ authorize: () => Promise.resolve({ status: "authorized", userId: "user" }) });
  let grant = "";
  await expect(bridge.run("token", "guild", (issued) => { grant = issued; return Promise.reject(new Error("handler failed")); })).rejects.toThrow("handler failed");
  expect(bridge.get(grant)).toBeUndefined();
});
