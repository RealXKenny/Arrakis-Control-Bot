import { describe, expect, it } from "vitest";
import { loadLevelRoleConfig } from "../../../src/infrastructure/config/leveling";

describe("level role environment configuration", () => {
  it("maps configured role IDs and treats blank entries as disabled", () => {
    expect(loadLevelRoleConfig({
      LEVEL_ROLE_ARRAKIS_WANDERER_ID: " 123456789012345678 ",
      LEVEL_ROLE_SIETCH_DWELLER_ID: " ",
      LEVEL_ROLE_CHOSEN_OF_ARRAKIS_ID: "823456789012345678",
      LEVEL_ANNOUNCEMENT_CHANNEL_ID: " 923456789012345678 ",
    })).toEqual({
      announcementChannelId: "923456789012345678",
      arrakisWanderer: "123456789012345678",
      sietchDweller: undefined,
      desertSurvivor: undefined,
      sandWarrior: undefined,
      spiceHunter: undefined,
      fremenInitiate: undefined,
      desertMaster: undefined,
      chosenOfArrakis: "823456789012345678",
    });
  });
});
