import { afterEach, expect, it, vi } from "vitest";
import { cleanupResources } from "../../../src/shared/process/cleanupResources";

afterEach(() => vi.useRealTimers());

it("closes every resource despite a synchronous or asynchronous failure", async () => {
  vi.useFakeTimers();
  const error = vi.fn();
  const timeout = vi.fn();
  const close = vi.fn();
  await cleanupResources([
    { name: "sync", run: () => { throw new Error("sync"); } },
    { name: "async", run: () => Promise.reject(new Error("async")) },
    { name: "healthy", run: close },
  ], error, timeout);
  expect(close).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expect(timeout).not.toHaveBeenCalled();
});

it("bounds a hung cleanup without blocking other resources", async () => {
  vi.useFakeTimers();
  const timeout = vi.fn();
  const close = vi.fn();
  const pending = cleanupResources([
    { name: "hung", run: () => new Promise(() => undefined) },
    { name: "healthy", run: close },
  ], vi.fn(), timeout, 100);
  expect(close).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(timeout).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
