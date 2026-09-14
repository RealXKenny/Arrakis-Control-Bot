import { describe, expect, it } from "vitest";

import { MAX_BLUEPRINT_BYTES, validateBlueprintUpload } from "../../../../src/modules/players/blueprints/blueprintValidator";

const attachment = (overrides: Partial<{ name: string; url: string; size: number }> = {}) => ({ name: "base.json", url: "https://uploads.example/base.json", size: 128, ...overrides });
const json = (value: unknown) => Buffer.from(JSON.stringify(value));

describe("validateBlueprintUpload", () => {
  it("accepts a valid Dune blueprint and returns its parsed data", () => {
    const blueprint = { instances: [{ building_type: "Wall", instance_id: "42" }], placeables: [{ building_type: "Door" }], pentashields: [{}] };
    expect(validateBlueprintUpload(attachment(), json(blueprint))).toEqual(blueprint);
  });

  it.each([
    [null, json({ instances: [] }), "valid blueprint attachment"],
    [attachment({ name: "base.txt" }), json({ instances: [] }), ".json filename"],
    [attachment(), Buffer.alloc(0), "cannot be empty"],
    [attachment(), Buffer.from([123, 0, 125]), "not binary data"],
    [attachment(), Buffer.from("{"), "not valid JSON"],
    [attachment(), json([]), "top-level object"],
    [attachment(), json({ metadata: {} }), "no blueprint collections"],
    [attachment(), json({ instances: {}, placeables: [] }), "must be an array"],
    [attachment(), json({ instances: ["wall"] }), "must be an object"],
    [attachment(), json({ instances: [{}] }), "missing a building_type"],
    [attachment(), json({ instances: [{ building_type: "Wall", instance_id: "abc" }] }), "invalid instance_id"],
  ])("rejects invalid input %#", (file, contents, message) => {
    expect(() => validateBlueprintUpload(file, contents)).toThrow(message);
  });

  it("rejects sizes declared or observed above the configured limit", () => {
    expect(() => validateBlueprintUpload(attachment({ size: MAX_BLUEPRINT_BYTES + 1 }), json({ instances: [] }))).toThrow("32 MB or smaller");
    expect(() => validateBlueprintUpload(attachment(), Buffer.alloc(MAX_BLUEPRINT_BYTES + 1, 32))).toThrow("32 MB or smaller");
  });

  it("rejects forbidden prototype-related keys after JSON parsing", () => {
    expect(() => validateBlueprintUpload(attachment(), Buffer.from('{"instances":[],"constructor":{"polluted":true}}'))).toThrow("forbidden field");
  });
});
