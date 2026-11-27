/**
 * The chatbot's feelings: one mood for the server and a rapport with each member. Kindness
 * lifts them, rudeness lowers them, and both drift back toward a calm, friendly baseline over
 * a few hours. Feelings only change how the bot words things; it never stops helping anyone
 * and is never unkind back.
 */

type MoodLabel = "thrilled" | "happy" | "content" | "meh" | "down" | "hurt";

type FeelingEvent = "compliment" | "thanks" | "greeting" | "insult" | "farewell" | "chat";

interface MoodState {
  /** -100 (hurt) to 100 (thrilled). */
  score: number;
  updatedAt: number;
}

const BASELINE = 20;
const MOOD_HALF_LIFE_MS = 6 * 60 * 60_000;
const MOOD_DELTAS: Readonly<Record<FeelingEvent, number>> = Object.freeze({ compliment: 12, thanks: 6, greeting: 2, farewell: 1, chat: 0.5, insult: -15 });
const RAPPORT_DELTAS: Readonly<Record<FeelingEvent, number>> = Object.freeze({ compliment: 6, thanks: 3, greeting: 1, farewell: 1, chat: 0.25, insult: -8 });
const RAPPORT_LIMIT = 50;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** The mood after time has passed: it eases back toward the baseline with a six-hour half-life. */
function settle(mood: MoodState, now: number): MoodState {
  const elapsed = Math.max(0, now - mood.updatedAt);
  const factor = 0.5 ** (elapsed / MOOD_HALF_LIFE_MS);
  return { score: BASELINE + (mood.score - BASELINE) * factor, updatedAt: now };
}

function feel(mood: MoodState, event: FeelingEvent, now: number): MoodState {
  const settled = settle(mood, now);
  return { score: clamp(settled.score + MOOD_DELTAS[event], 100), updatedAt: now };
}

function adjustRapport(rapport: number, event: FeelingEvent): number {
  return clamp(rapport + RAPPORT_DELTAS[event], RAPPORT_LIMIT);
}

function moodLabel(score: number): MoodLabel {
  if (score >= 70) return "thrilled";
  if (score >= 35) return "happy";
  if (score >= 5) return "content";
  if (score >= -25) return "meh";
  if (score >= -60) return "down";
  return "hurt";
}

function initialMood(now: number): MoodState {
  return { score: BASELINE, updatedAt: now };
}

export { BASELINE, RAPPORT_LIMIT, adjustRapport, feel, initialMood, moodLabel, settle };
export type { FeelingEvent, MoodLabel, MoodState };
