import { afterEach, describe, expect, it, vi } from "vitest";

import { DeadlineExceededError, withDeadline } from "../../../src/shared/async/withDeadline";

describe("withDeadline", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the result when work finishes in time", async () => {
    await expect(withDeadline(Promise.resolve("done"), 50)).resolves.toBe("done");
  });

  it("passes through the work's own failure", async () => {
    await expect(withDeadline(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });

  it("rejects with DeadlineExceededError when work is too slow", async () => {
    vi.useFakeTimers();
    const pending = withDeadline(new Promise<never>(() => undefined), 2_000);
    const assertion = expect(pending).rejects.toBeInstanceOf(DeadlineExceededError);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});
