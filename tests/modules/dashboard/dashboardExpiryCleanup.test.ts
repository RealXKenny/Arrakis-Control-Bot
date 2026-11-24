import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardExpiryCleanup } from "../../../src/modules/dashboard/dashboardExpiryCleanup";

afterEach(() => vi.useRealTimers());

describe("dashboard expiry cleanup", () => {
  it("cleans all stores despite failure and stops its timer", async () => {
    vi.useFakeTimers();
    const failure = new Error("offline");
    const bad = { purgeExpired: vi.fn().mockRejectedValue(failure) };
    const good = { purgeExpired: vi.fn().mockResolvedValue(undefined) };
    const onError = vi.fn();
    const cleanup = new DashboardExpiryCleanup([{ name: "bad", store: bad }, { name: "good", store: good }], onError, 1_000);
    cleanup.start();
    cleanup.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(good.purgeExpired).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("bad", failure);
    await cleanup.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces concurrent cleanup runs and waits for them on shutdown", async () => {
    let finish!: () => void;
    const store = { purgeExpired: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) };
    const cleanup = new DashboardExpiryCleanup([{ name: "sessions", store }], vi.fn(), 1_000);
    const first = cleanup.run();
    const second = cleanup.run();
    const stop = cleanup.stop();
    expect(store.purgeExpired).toHaveBeenCalledOnce();
    finish();
    await Promise.all([first, second, stop]);
  });

  it("contains a failure in the error reporter", async () => {
    const cleanup = new DashboardExpiryCleanup(
      [{ name: "sessions", store: { purgeExpired: () => Promise.reject(new Error("offline")) } }],
      () => { throw new Error("logger failed"); },
      1_000,
    );
    await expect(cleanup.run()).resolves.toBeUndefined();
  });
});
