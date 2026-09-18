export const MUSIC_COMMANDS = {
  play: "Request a song or playlist in the music lounge.",
  queue: "Show the current song and upcoming requests.",
  now: "Show the current song and artwork.",
  skip: "Skip your currently playing song.",
  pause: "Pause your currently playing song.",
  resume: "Resume your currently playing song.",
  volume: "Set the volume while your song is playing.",
  stop: "Stop your song and clear the queue; remain in voice.",
  clear: "Clear upcoming songs while your song is playing.",
  "music-panel": "Publish or refresh the music controls (Manage Server).",
} as const;
export type MusicCommandName = keyof typeof MUSIC_COMMANDS;
