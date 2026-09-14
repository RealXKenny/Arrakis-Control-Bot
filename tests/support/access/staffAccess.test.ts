import { afterEach, describe, expect, it } from "vitest";
import { canModerateMember, getConfiguredStaffRoleIds, hasStaffRole } from "../../../src/support/access/staffAccess";

const roleKeys = ["TRIAL_STAFF_ROLE_ID", "MODERATOR_ROLE_ID", "SENIOR_MODERATOR_ROLE_ID", "ADMINISTRATOR_ROLE_ID", "HEAD_ADMINISTRATOR_ROLE_ID", "OWNER_ROLE_ID"];
const original = Object.fromEntries(roleKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of roleKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("staff access", () => {
  it("deduplicates configured staff roles and detects membership", () => {
    for (const key of roleKeys) delete process.env[key];
    process.env.MODERATOR_ROLE_ID = "staff";
    process.env.ADMINISTRATOR_ROLE_ID = "staff";
    expect(getConfiguredStaffRoleIds()).toEqual(["staff"]);
    expect(hasStaffRole({ roles: { cache: { has: (id: string) => id === "staff" } } } as never)).toBe(true);
  });

  it("enforces self, owner, and role-hierarchy moderation boundaries", () => {
    const member = (id: string, position: number) => ({ id, roles: { highest: { comparePositionTo: (other: { position: number }) => position - other.position, position } } });
    expect(canModerateMember(member("actor", 10) as never, member("target", 5) as never, "owner")).toBe(true);
    expect(canModerateMember(member("actor", 5) as never, member("target", 10) as never, "owner")).toBe(false);
    expect(canModerateMember(member("actor", 10) as never, member("actor", 5) as never, "owner")).toBe(false);
    expect(canModerateMember(member("owner", 1) as never, member("target", 99) as never, "owner")).toBe(true);
    expect(canModerateMember(member("actor", 99) as never, member("owner", 1) as never, "owner")).toBe(false);
  });
});
