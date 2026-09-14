import { afterEach, describe, expect, it } from "vitest";
import { getConfiguredRoleIds, getConfiguredRoleOptions } from "../../../../src/modules/community/roles/selfAssignableRoles";

const keys = ["ROLE_PVP_ID", "ROLE_PVE_ID", "ROLE_BUILDER_ID", "ROLE_CRAFTER_ID", "ROLE_TRADER_ID", "ROLE_EXPLORER_ID", "ROLE_ENDGAME_ID", "ROLE_ATREIDES_ID", "ROLE_HARKONNEN_ID", "ROLE_FREMEN_ID", "ROLE_NEUTRAL_ID", "ROLE_ANNOUNCEMENTS_ID", "ROLE_EVENTS_ID", "ROLE_PVP_ALERTS_ID", "ROLE_MARKET_ALERTS_ID", "ROLE_LFG_ALERTS_ID"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("self-assignable role configuration", () => {
  it("omits missing and placeholder ids while preserving labels", () => {
    for (const key of keys) delete process.env[key];
    process.env.ROLE_PVP_ID = "pvp-role";
    process.env.ROLE_PVE_ID = "replace_with_pve_role_id";
    expect(getConfiguredRoleOptions()).toEqual([expect.objectContaining({ label: expect.stringContaining("PvP"), value: "pvp-role" })]);
    expect([...getConfiguredRoleIds()]).toEqual(["pvp-role"]);
  });
});
