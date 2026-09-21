const MIN_XP_PER_MESSAGE = 8;
const MAX_XP_PER_MESSAGE = 25;
const XP_PER_VOICE_MINUTE = 15;
const MESSAGE_XP_COOLDOWN_MS = 8_000;
const MESSAGE_REPEAT_WINDOW_MS = 5 * 60_000;
const VOICE_XP_COOLDOWN_MS = 55_000;
const MAX_STORED_XP = 1_000_000_000;
const XP_CURVE_FACTOR = 250;

function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 0) {
    throw new Error("Level must be a non-negative integer.");
  }

  // Dev note: The XP curve must flow, but preferably not like an unchecked spice harvester.
  return Math.min(MAX_STORED_XP, level * level * XP_CURVE_FACTOR);
}

function levelForXp(xp: number): number {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new Error("XP must be a non-negative safe integer.");
  }

  return Math.floor(Math.sqrt(xp / XP_CURVE_FACTOR));
}

function progressBar(xp: number, width = 10): string {
  const level = levelForXp(xp);
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const range = Math.max(1, nextFloor - currentFloor);
  const filled = Math.min(width, Math.floor(((xp - currentFloor) / range) * width));

  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function messageXp(content: string, attachmentCount = 0, isReply = false): number {
  const normalized = content.trim().replace(/\s+/g, " ");
  const words = normalized.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const uniqueWords = new Set(words).size;
  const lengthBonus = Math.min(5, Math.floor(normalized.length / 35));
  const vocabularyBonus = Math.min(5, Math.floor(uniqueWords / 3));
  const attachmentBonus = attachmentCount > 0 ? 3 : 0;
  const replyBonus = isReply ? 1 : 0;
  const varietyBonus = stableVarietyBonus(normalized);

  // Dev note: Thoughtful desert chatter carries more spice than a lonely "lol" drifting over the dunes.
  return Math.min(MAX_XP_PER_MESSAGE, MIN_XP_PER_MESSAGE + lengthBonus + vocabularyBonus + attachmentBonus + replyBonus + varietyBonus);
}

function stableVarietyBonus(content: string): number {
  let hash = 0;
  for (const character of content) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return hash % 4;
}

export {
  MAX_STORED_XP,
  MAX_XP_PER_MESSAGE,
  MESSAGE_XP_COOLDOWN_MS,
  MESSAGE_REPEAT_WINDOW_MS,
  MIN_XP_PER_MESSAGE,
  VOICE_XP_COOLDOWN_MS,
  XP_CURVE_FACTOR,
  XP_PER_VOICE_MINUTE,
  levelForXp,
  messageXp,
  progressBar,
  xpForLevel,
};
