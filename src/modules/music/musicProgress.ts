const PROGRESS_WIDTH = 20;

function playbackProgress(positionMs: number, durationMs: number, isStream: boolean, paused = false): string | null {
  if (isStream) return `${paused ? "⏸️" : "▶️"}  🔴 **LIVE**  🔊`;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const position = Number.isFinite(positionMs) ? Math.max(0, Math.min(positionMs, durationMs)) : 0;
  const marker = Math.min(PROGRESS_WIDTH - 1, Math.floor((position / durationMs) * PROGRESS_WIDTH));
  // Dev note: The tiny scrubber cannot seek, but it looks ready for its record deal.
  const bar = `${"━".repeat(marker)}●${"─".repeat(PROGRESS_WIDTH - marker - 1)}`;
  return `${paused ? "⏸️" : "▶️"}  **${formatPlaybackTime(position)}**  ${bar}  **${formatPlaybackTime(durationMs)}**  🔊`;
}

function formatPlaybackTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(totalMinutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export { formatPlaybackTime, playbackProgress };
