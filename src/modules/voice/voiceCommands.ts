export const VOICE_COMMANDS = {
  setup: "Configure join-to-create rooms (Manage Server required).",
  panel: "Restore the voice control panel (Manage Server required).",
  disable: "Stop new rooms; existing rooms keep working (Manage Server required).",
  rename: "Rename the room you own and are currently in.",
  limit: "Set your room's user limit.",
  lock: "Prevent new members from joining your room.",
  unlock: "Restore your room's original join permissions.",
  hide: "Hide your room from other members.",
  show: "Restore your room's original visibility.",
  delete: "Delete the room you own and disconnect its members.",
  permit: "Allow a member to see and join your room.",
  reject: "Deny a member access and disconnect them from your room.",
  kick: "Disconnect a member currently in your room.",
} as const;
export type VoiceCommandAction = keyof typeof VOICE_COMMANDS;
