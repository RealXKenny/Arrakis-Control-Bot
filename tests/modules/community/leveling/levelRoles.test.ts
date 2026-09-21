import { describe, expect, it } from "vitest";
import { LEVEL_ROLE_TIERS, nextRoleTier, roleTierForLevel } from "../../../../src/modules/community/leveling/levelRoles";

describe("community level roles", () => {
  it("preserves all requested role names at increasing thresholds", () => {
    expect(LEVEL_ROLE_TIERS.map((tier) => tier.name)).toEqual([
      "Arrakis Wanderer",
      "Sietch Dweller",
      "Desert Survivor",
      "Sand Warrior",
      "Spice Hunter",
      "Fremen Initiate",
      "Desert Master",
      "Chosen of Arrakis",
    ]);
    expect(LEVEL_ROLE_TIERS.map((tier) => tier.level)).toEqual([1, 10, 20, 30, 40, 50, 60, 70]);
  });

  it("selects only the highest earned role and the next target", () => {
    expect(roleTierForLevel(0)).toBeNull();
    expect(roleTierForLevel(32)?.name).toBe("Sand Warrior");
    expect(roleTierForLevel(99)?.name).toBe("Chosen of Arrakis");
    expect(nextRoleTier(32)?.name).toBe("Spice Hunter");
    expect(nextRoleTier(70)).toBeNull();
  });
});
