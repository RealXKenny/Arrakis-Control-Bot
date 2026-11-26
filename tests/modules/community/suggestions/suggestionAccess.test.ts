import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { afterEach, describe, expect, it } from "vitest";
import { isSuggestionStaff } from "../../../../src/modules/community/suggestions/suggestionAccess";

const subject = (overrides: Partial<Parameters<typeof isSuggestionStaff>[0]> = {}) => ({
  user: { id: "member" }, guild: { ownerId: "owner" }, member: null, memberPermissions: new PermissionsBitField(), ...overrides,
});

afterEach(() => { delete process.env.MODERATOR_ROLE_ID; });

describe("suggestion staff access", () => {
  it("denies ordinary members", () => {
    expect(isSuggestionStaff(subject())).toBe(false);
  });

  it("allows the owner, thread managers and configured staff roles", () => {
    process.env.MODERATOR_ROLE_ID = "mod-role";
    expect(isSuggestionStaff(subject({ user: { id: "owner" } }))).toBe(true);
    expect(isSuggestionStaff(subject({ memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageThreads) }))).toBe(true);
    expect(isSuggestionStaff(subject({ member: { roles: ["mod-role"] } as never }))).toBe(true);
    expect(isSuggestionStaff(subject({ member: { roles: { cache: new Map([["mod-role", {}]]) } } as never }))).toBe(true);
    expect(isSuggestionStaff(subject({ member: { roles: ["other"] } as never }))).toBe(false);
  });
});
