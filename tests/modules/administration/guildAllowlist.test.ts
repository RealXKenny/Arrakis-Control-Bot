import { Collection, type Client, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { isAllowedGuild, leaveIfUnauthorized, leaveUnauthorizedGuilds } from "../../../src/modules/administration/guildAllowlist";

const home = "123456789012345678";
const other = "223456789012345678";
function setup(fetched: string[] = [home, other]) {
  const guilds = new Map<string, Guild>();
  for (const id of [home, other]) guilds.set(id, { id, leave: vi.fn().mockResolvedValue(undefined) } as unknown as Guild);
  const client = { guilds: { cache: guilds, fetch: vi.fn().mockResolvedValue(new Collection(fetched.map((id) => [id, { id }]))) } } as unknown as Client;
  const logger = { warn: vi.fn(), error: vi.fn() };
  return { client, guilds, logger };
}

describe("guild allowlist", () => {
  it("allows every guild only when no allowlist is configured", () => {
    expect(isAllowedGuild([], other)).toBe(true);
    expect(isAllowedGuild([home], home)).toBe(true);
    expect(isAllowedGuild([home], other)).toBe(false);
  });

  it("leaves guilds outside the allowlist and keeps the home guild", async () => {
    const { client, guilds, logger } = setup();
    expect(await leaveUnauthorizedGuilds(client, [home], logger)).toBe(1);
    expect(guilds.get(other)!.leave).toHaveBeenCalledOnce();
    expect(guilds.get(home)!.leave).not.toHaveBeenCalled();
    expect(await leaveUnauthorizedGuilds(client, [], logger)).toBe(0);
  });

  it("never leaves anything when the allowlisted guild is missing, which signals misconfiguration", async () => {
    const { client, guilds, logger } = setup([other]);
    expect(await leaveIfUnauthorized(client, guilds.get(other)!, [home], logger)).toBe(false);
    expect(guilds.get(other)!.leave).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Check the configuration"));
  });

  it("logs and continues when Discord rejects a leave", async () => {
    const { client, guilds, logger } = setup();
    vi.mocked(guilds.get(other)!.leave).mockRejectedValueOnce(new Error("offline"));
    expect(await leaveIfUnauthorized(client, guilds.get(other)!, [home], logger)).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Unable to leave"), expect.any(Error));
  });
});
