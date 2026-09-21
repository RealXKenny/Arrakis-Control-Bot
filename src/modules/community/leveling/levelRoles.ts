import type { LevelRoleConfig } from "../../../infrastructure/config/leveling";

interface LevelRoleTier {
  level: number;
  name: string;
  configKey: keyof LevelRoleConfig;
}

const LEVEL_ROLE_TIERS: readonly LevelRoleTier[] = [
  { level: 1, name: "Arrakis Wanderer", configKey: "arrakisWanderer" },
  { level: 10, name: "Sietch Dweller", configKey: "sietchDweller" },
  { level: 20, name: "Desert Survivor", configKey: "desertSurvivor" },
  { level: 30, name: "Sand Warrior", configKey: "sandWarrior" },
  { level: 40, name: "Spice Hunter", configKey: "spiceHunter" },
  { level: 50, name: "Fremen Initiate", configKey: "fremenInitiate" },
  { level: 60, name: "Desert Master", configKey: "desertMaster" },
  { level: 70, name: "Chosen of Arrakis", configKey: "chosenOfArrakis" },
];

function roleTierForLevel(level: number): LevelRoleTier | null {
  // Dev note: Start at the fanciest title; promotions should not accidentally walk backward.
  return [...LEVEL_ROLE_TIERS].reverse().find((tier) => level >= tier.level) ?? null;
}

function nextRoleTier(level: number): LevelRoleTier | null {
  return LEVEL_ROLE_TIERS.find((tier) => tier.level > level) ?? null;
}

export { LEVEL_ROLE_TIERS, nextRoleTier, roleTierForLevel };
export type { LevelRoleTier };
