import { describe, expect, it, vi } from "vitest";
import { startShardManager } from "../../src/client/shardManagerStartup";

describe("shard manager startup", () => {
  it("stops already spawned shards after a later shard fails", async () => {
    const failure = new Error("second shard failed");
    const report = vi.fn();
    const stop = vi.fn();
    await startShardManager({ spawn: () => Promise.reject(failure) }, report, stop);
    expect(report).toHaveBeenCalledWith(failure);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("leaves a successfully started manager running", async () => {
    const report = vi.fn();
    const stop = vi.fn();
    await startShardManager({ spawn: () => Promise.resolve() }, report, stop);
    expect(report).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
