import { expect, it } from "vitest";
import { CATALOG_NAMES, searchCatalog, adminCatalogOptions, validateCatalogGrant, haggaRegion, catalogItemName } from "../../../../src/modules/players/administration/gameCatalogs";
import { groupedCommandDefinition } from "../../../../src/support/commands/groupedCommandFactory";

it("bundles all eight reference datasets and exposes catalog lookup", () => {
  for (const name of CATALOG_NAMES) expect(searchCatalog(name, "").length).toBeGreaterThan(0);
  expect(groupedCommandDefinition("player").toJSON().options?.some((option) => option.name === "catalog")).toBe(true);
  expect(catalogItemName("T6_Augment_Acuracy1")).toBe("Precision Barrel Adjuster");
});
it("searches friendly item names while returning exact template IDs within Discord bounds", () => {
  expect(adminCatalogOptions("give-item-id", "item-id", "precision barrel")).toContainEqual(expect.objectContaining({ value: "T6_Augment_Acuracy1" }));
  for (const option of ["item-id", "item-name", "node-id", "module"]) {
    const rows = adminCatalogOptions("give-item-id", option, "");
    expect(rows.length).toBeLessThanOrEqual(25);
    expect(rows.every((row) => row.name.length <= 100 && row.value.length <= 100)).toBe(true);
  }
  expect(adminCatalogOptions("augment-item", "item-id", "precision")).toEqual([]);
});
it("filters vehicle templates by the selected vehicle and validates the pair", () => {
  expect(adminCatalogOptions("spawn-vehicle", "template", "", "Sandbike").map((row) => row.value)).toContain("T1_ExtraSeat");
  expect(adminCatalogOptions("spawn-vehicle", "template", "", "Buggy").map((row) => row.value)).not.toContain("T1_ExtraSeat");
  expect(() => validateCatalogGrant("spawn-vehicle", { vehicleId: "Buggy", template: "T1_ExtraSeat" })).toThrow("Choose a template");
});
it("checks known skill limits without rejecting unknown future identifiers", () => {
  expect(() => validateCatalogGrant("set-skill-module", { module: "Skills.Ability.BinduNerveStrike", level: 2 })).toThrow("0–1");
  expect(() => validateCatalogGrant("set-skill-module", { module: "FutureModule", level: 2 })).not.toThrow();
});
it("rejects a known incompatible augment but accepts matching tags", () => {
  expect(() => validateCatalogGrant("give-item-id", { itemId: "Assassin_Light06_Unique_Helmet", augments: ["T6_Augment_Acuracy1"] })).toThrow("not compatible");
  expect(() => validateCatalogGrant("give-item", { itemName: "A Dart for Every Man", augments: ["T6_Augment_Acuracy1"] })).not.toThrow();
});
it("only applies Hagga region IDs to the matching map", () => {
  expect(haggaRegion("HaggaBasin", 2)).toBe("Western Vermillius Gap");
  expect(haggaRegion("DeepDesert", 2)).toBeUndefined();
});
