const PROGRESS_WIDTH = 18;

function playbackProgress(positionMs: number, durationMs: number, isStream: boolean): string | null {
  if (isStream) return "🔴 **LIVE**";
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const position = Number.isFinite(positionMs) ? Math.max(0, Math.min(positionMs, durationMs)) : 0;
  const filled = Math.min(PROGRESS_WIDTH, Math.floor((position / durationMs) * PROGRESS_WIDTH));
  // Dev note: Even a sandworm's journey benefits from a tiny progress bar.
  return `${"▰".repeat(filled)}${"▱".repeat(PROGRESS_WIDTH - filled)}  **${formatPlaybackTime(position)} / ${formatPlaybackTime(durationMs)}**`;
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
