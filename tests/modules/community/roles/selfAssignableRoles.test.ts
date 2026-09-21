import { afterEach, describe, expect, it } from "vitest";
import { CLEAR_ROLES_VALUE, getConfiguredRoleIds, getConfiguredRoleOptions, selectedRoleIds } from "../../../../src/modules/community/roles/selfAssignableRoles";
import { buildRolePanel } from "../../../../src/modules/community/roles/rolePanel";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../../src/shared/discord/discordLimits";

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

  it("normalizes configured role IDs and removes duplicate menu values", () => {
    for (const key of keys) delete process.env[key];
    process.env.ROLE_PVP_ID = " 111111111111111111 ";
    process.env.ROLE_PVE_ID = "111111111111111111";
    expect(getConfiguredRoleOptions()).toEqual([expect.objectContaining({ value: "111111111111111111" })]);
  });

  it("builds a valid selectable panel and keeps the clear option available", () => {
    for (const key of keys) delete process.env[key];
    process.env.ROLE_PVP_ID = "111111111111111111";
    process.env.ROLE_PVE_ID = "222222222222222222";

    const panel = buildRolePanel().toJSON();
    const row = panel.components.find((component) => component.type === 1);
    expect(row?.type).toBe(1);
    if (!row || row.type !== 1) throw new Error("Role menu action row is missing.");
    const menu = row.components[0];
    expect(menu).toMatchObject({
      type: 3,
      min_values: 1,
      max_values: 2,
      options: [
        expect.objectContaining({ value: "111111111111111111" }),
        expect.objectContaining({ value: "222222222222222222" }),
        expect.objectContaining({ value: CLEAR_ROLES_VALUE }),
      ],
    });
    expect(countComponents([panel])).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
    expect(countDisplayableText([panel])).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  });

  it("clears all roles when the clear option is selected, even alongside another option", () => {
    const allowed = new Set(["111111111111111111", "222222222222222222"]);
    expect(selectedRoleIds(["111111111111111111", CLEAR_ROLES_VALUE], allowed)).toEqual([]);
    expect(selectedRoleIds(["222222222222222222", "not-configured"], allowed)).toEqual(["222222222222222222"]);
  });
});
