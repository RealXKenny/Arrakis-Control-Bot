import type { ChatInputCommandInteraction } from "discord.js";
import { afterEach, expect, it, vi } from "vitest";
import { StaffOnly } from "../../src/preconditions/access/staffOnly";

afterEach(() => vi.unstubAllEnvs());

const fakePrecondition = { ok: () => ({ ok: true }), error: (details: unknown) => ({ ok: false, details }) };
const run = (interaction: unknown) => StaffOnly.prototype.chatInputRun.call(fakePrecondition as never, interaction as ChatInputCommandInteraction);

it("fails closed outside a guild, where staff roles cannot be checked", async () => {
  expect(await run({ guild: null, user: { id: "1" } })).toMatchObject({ ok: false });
});

it("allows configured staff and denies other members", async () => {
  vi.stubEnv("MODERATOR_ROLE_ID", "123456789012345678");
  const member = (roles: string[]) => ({ roles: { cache: new Map(roles.map((id) => [id, {}])) } });
  const guild = (roles: string[]) => ({ members: { fetch: vi.fn().mockResolvedValue(member(roles)) } });
  expect(await run({ guild: guild(["123456789012345678"]), user: { id: "1" } })).toMatchObject({ ok: true });
  expect(await run({ guild: guild([]), user: { id: "1" } })).toMatchObject({ ok: false });
});
