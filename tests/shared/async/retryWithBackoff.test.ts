import { expect, it, vi } from "vitest";

import { retryWithBackoff } from "../../../src/shared/async/retryWithBackoff";

it("retries with doubling, capped delays until the work succeeds", async () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const work = vi.fn().mockRejectedValueOnce(new Error("a")).mockRejectedValueOnce(new Error("b")).mockRejectedValueOnce(new Error("c")).mockResolvedValue("ok");
  await expect(retryWithBackoff(work, { initialDelayMs: 10, maxDelayMs: 25, sleep })).resolves.toBe("ok");
  expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20, 25]);
});

it("gives up with the last error once told to stop", async () => {
  let stop = false;
  const sleep = vi.fn(() => { stop = true; return Promise.resolve(); });
  await expect(retryWithBackoff(() => Promise.reject(new Error("down")), { sleep, shouldStop: () => stop })).rejects.toThrow("down");
  expect(sleep).toHaveBeenCalledOnce();
});

it("does not retry errors that retryIf rejects", async () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  await expect(retryWithBackoff(() => Promise.reject(new TypeError("config")), { sleep, retryIf: (error) => !(error instanceof TypeError) })).rejects.toThrow("config");
  expect(sleep).not.toHaveBeenCalled();
});
