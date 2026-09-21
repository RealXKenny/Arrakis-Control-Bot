import { describe, expect, it } from "vitest";
import { formatPlaybackTime, playbackProgress } from "../../../src/modules/music/musicProgress";

describe("music playback progress", () => {
  it("formats bounded track progress and clamps stale positions", () => {
    expect(playbackProgress(90_000, 240_000, false)).toBe("▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱  **1:30 / 4:00**");
    expect(playbackProgress(300_000, 240_000, false)).toBe("▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰  **4:00 / 4:00**");
    expect(playbackProgress(0, 0, false)).toBeNull();
  });

  it("labels streams and formats hour-long recordings", () => {
    expect(playbackProgress(0, 0, true)).toBe("🔴 **LIVE**");
    expect(formatPlaybackTime(3_661_000)).toBe("1:01:01");
  });
});
