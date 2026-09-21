import { describe, expect, it } from "vitest";
import { MAX_XP_PER_MESSAGE, MIN_XP_PER_MESSAGE, levelForXp, messageXp, progressBar, xpForLevel } from "../../../../src/modules/community/leveling/levelProgress";

describe("community level progress", () => {
  it("uses a stable quadratic XP curve", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(250);
    expect(xpForLevel(5)).toBe(6_250);
    expect(levelForXp(249)).toBe(0);
    expect(levelForXp(250)).toBe(1);
    expect(levelForXp(2_249)).toBe(2);
    expect(levelForXp(2_250)).toBe(3);
  });

  it("renders progress within the current level", () => {
    expect(progressBar(0)).toBe("▱▱▱▱▱▱▱▱▱▱");
    expect(progressBar(125)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(progressBar(250)).toBe("▱▱▱▱▱▱▱▱▱▱");
  });

  it("rejects invalid XP and levels", () => {
    expect(() => xpForLevel(-1)).toThrow("non-negative integer");
    expect(() => levelForXp(Number.MAX_VALUE)).toThrow("safe integer");
  });

  it("varies message XP using bounded effort signals", () => {
    const shortAward = messageXp("lol");
    const thoughtfulAward = messageXp("The spice harvest is ready, and I can help move every crate back to the sietch.", 1, true);

    expect(shortAward).toBeGreaterThanOrEqual(MIN_XP_PER_MESSAGE);
    expect(thoughtfulAward).toBeGreaterThan(shortAward);
    expect(thoughtfulAward).toBeLessThanOrEqual(MAX_XP_PER_MESSAGE);
    expect(messageXp("same meaningful message")).toBe(messageXp("same meaningful message"));
  });
});
