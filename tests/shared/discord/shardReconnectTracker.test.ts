import { describe, expect, it } from "vitest";
import { ShardReconnectTracker } from "../../../src/shared/discord/shardReconnectTracker";

describe("ShardReconnectTracker", () => {
  it("stays quiet through five attempts and warns once on the sixth", () => {
    const tracker = new ShardReconnectTracker();
    tracker.disconnected(0, 1_006);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(tracker.reconnecting(0)).toEqual({ attempts: attempt, shouldWarn: false, closeCode: 1_006 });
    }
    expect(tracker.reconnecting(0)).toEqual({ attempts: 6, shouldWarn: true, closeCode: 1_006 });
    expect(tracker.reconnecting(0)).toEqual({ attempts: 7, shouldWarn: false, closeCode: 1_006 });
  });

  it("reports only noisy recovery episodes and resets after recovery", () => {
    const tracker = new ShardReconnectTracker();
    tracker.reconnecting(2);
    expect(tracker.recovered(2)).toEqual({ attempts: 1, shouldReport: false });

    for (let attempt = 0; attempt < 6; attempt++) tracker.reconnecting(2);
    expect(tracker.recovered(2)).toEqual({ attempts: 6, shouldReport: true });
    expect(tracker.recovered(2)).toEqual({ attempts: 0, shouldReport: false });
  });
});
