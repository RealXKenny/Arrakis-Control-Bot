interface LevelRoleConfig {
  announcementChannelId?: string;
  arrakisWanderer?: string;
  sietchDweller?: string;
  desertSurvivor?: string;
  sandWarrior?: string;
  spiceHunter?: string;
  fremenInitiate?: string;
  desertMaster?: string;
  chosenOfArrakis?: string;
}

function loadLevelRoleConfig(env: NodeJS.ProcessEnv): Readonly<LevelRoleConfig> {
  // Dev note: Titles belong to Discord; the environment only supplies their backstage passes.
  return Object.freeze({
    announcementChannelId: optional(env.LEVEL_ANNOUNCEMENT_CHANNEL_ID),
    arrakisWanderer: optional(env.LEVEL_ROLE_ARRAKIS_WANDERER_ID),
    sietchDweller: optional(env.LEVEL_ROLE_SIETCH_DWELLER_ID),
    desertSurvivor: optional(env.LEVEL_ROLE_DESERT_SURVIVOR_ID),
    sandWarrior: optional(env.LEVEL_ROLE_SAND_WARRIOR_ID),
    spiceHunter: optional(env.LEVEL_ROLE_SPICE_HUNTER_ID),
    fremenInitiate: optional(env.LEVEL_ROLE_FREMEN_INITIATE_ID),
    desertMaster: optional(env.LEVEL_ROLE_DESERT_MASTER_ID),
    chosenOfArrakis: optional(env.LEVEL_ROLE_CHOSEN_OF_ARRAKIS_ID),
  });
}

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export { loadLevelRoleConfig };
export type { LevelRoleConfig };
