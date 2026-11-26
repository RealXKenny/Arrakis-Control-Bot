import { describe, expect, it } from "vitest";
import { isRecord } from "../../../src/shared/validation/isRecord";

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ status: "ok" })).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    for (const value of [null, undefined, [], [1], "text", 42, true]) expect(isRecord(value)).toBe(false);
  });
});
