import { afterEach, expect, it, vi } from "vitest";
import { ChatOwnerResolver } from "../../../src/modules/chat/ChatOwnerResolver";

afterEach(() => vi.useRealTimers());

function setup() {
  const roles = new Map([["owner-role", {}]]);
  const members = new Map([["discord-owner", { id: "discord-owner", user: { bot: false }, roles: { cache: roles } }]]);
  const fetch = vi.fn().mockResolvedValue(members);
  const getCurrentPlayer = vi.fn().mockResolvedValue({ linked: true, pawnId: "900000403" });
  const call = vi.fn().mockResolvedValue({ player: { funcom_id: "Owner#12345" } });
  const client = { guilds: { cache: new Map([["guild", { members: { cache: members, fetch } }]]) }, discordAdapter: { getCurrentPlayer }, duneApi: { call } };
  const resolver = new ChatOwnerResolver(client as unknown as ConstructorParameters<typeof ChatOwnerResolver>[0], "owner-role");
  return { resolver, roles, fetch, getCurrentPlayer, call };
}

it("resolves verified owner links, caches them and honors role removal and guild isolation", async () => {
  const { resolver, roles, getCurrentPlayer, call } = setup();
  expect(await resolver.isOwner("guild", "Owner#12345")).toBe(true);
  expect(await resolver.isOwner("guild", "Owner#12345")).toBe(true);
  expect(getCurrentPlayer).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith("GET", "/api/players/{playerId}", { routeParams: { playerId: "900000403" } });
  expect(await resolver.isOwner("guild", "Owner#54321")).toBe(false);
  expect(await resolver.isOwner("another-guild", "Owner#12345")).toBe(false);
  roles.clear();
  expect(await resolver.isOwner("guild", "Owner#12345")).toBe(false);
});

it("does not label unverified links and refreshes after link removal", async () => {
  vi.useFakeTimers();
  const { resolver, getCurrentPlayer } = setup();
  expect(await resolver.isOwner("guild", "Owner#12345")).toBe(true);
  getCurrentPlayer.mockResolvedValue({ linked: false, pawnId: "900000403" });
  await vi.advanceTimersByTimeAsync(60_001);
  expect(await resolver.isOwner("guild", "Owner#12345")).toBe(false);
});

it("fails without a tag when APIs fail or member lookup takes too long", async () => {
  const failed = setup();
  failed.call.mockRejectedValue(new Error("forbidden"));
  expect(await failed.resolver.isOwner("guild", "Owner#12345")).toBe(false);
  vi.useFakeTimers();
  const slow = setup();
  slow.fetch.mockReturnValue(new Promise(() => undefined));
  const result = slow.resolver.isOwner("guild", "Owner#12345");
  await vi.advanceTimersByTimeAsync(2_000);
  expect(await result).toBe(false);
});
