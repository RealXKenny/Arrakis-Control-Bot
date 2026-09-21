import { describe, expect, it } from "vitest";
import { shouldReportReleaseFailure } from "../../src/listeners/discord/ready";

describe("release announcement retry logging", () => {
  it("stays quiet until five consecutive failures and then reports every fifth failure", () => {
    expect([1, 2, 3, 4].some(shouldReportReleaseFailure)).toBe(false);
    expect(shouldReportReleaseFailure(5)).toBe(true);
    expect(shouldReportReleaseFailure(6)).toBe(false);
    expect(shouldReportReleaseFailure(10)).toBe(true);
  });
});
