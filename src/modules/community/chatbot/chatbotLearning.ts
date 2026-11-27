/**
 * Rules for learning from chat: which messages are questions, and which replies are worth
 * remembering as answers. Deliberately strict, because a wrong answer repeated by the bot is
 * worse than no answer at all.
 */

const QUESTION_START = /^(who|whos|what|whats|when|where|wheres|why|how|hows|is|isnt|are|arent|can|cant|could|does|doesnt|do|dont|did|will|would|should|has|have|which|anyone|any1|anybody|does anyone|is there|are there)\b/;
const LOW_EFFORT = /^(idk|i dont know|no idea|dunno|not sure|same|same here|this|lol|lmao|haha+|ok|okay|k|yes|yeah|yep|no|nope|nah|true|facts|\+1|ty|thanks?|thank you|bump|good question|i was wondering (that|this) too)\W*$/;
const UNSAFE = /@everyone|@here|discord(?:app)?\.(?:gg|com\/invite)\/|<@&\d+>|\b(?:password|passwd|token|api[_ -]?key|secret)\b|\b\d{13,19}\b/i;

const MIN_QUESTION = 10;
const MAX_QUESTION = 300;
const MIN_ANSWER = 8;
const MAX_ANSWER = 700;

/** Plain text a message is compared by: no mentions, custom emoji or extra space. */
function plainText(value: string): string {
  return value
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedForRules(value: string): string {
  return plainText(value).toLowerCase().replace(/['’`]/g, "").replace(/\s+/g, " ").trim();
}

/** A real question someone could ask again: ends with `?` or starts like one, and has some substance. */
function isQuestion(raw: string): boolean {
  const text = plainText(raw);
  if (text.length < MIN_QUESTION || text.length > MAX_QUESTION || text.includes("```")) return false;
  const words = text.split(" ").length;
  if (words < 3) return false;
  const lower = normalizedForRules(text);
  return /\?\s*$/.test(text) || (QUESTION_START.test(lower) && words >= 4);
}

/** The question as it will be stored and matched, or null when it isn't one. */
function learnableQuestion(raw: string): string | null {
  if (UNSAFE.test(plainText(raw)) || !isQuestion(raw)) return null;
  return plainText(raw);
}

/** The answer as it will be stored, or null when it is too short, a non-answer, another question or unsafe to repeat. */
function learnableAnswer(raw: string): string | null {
  const text = plainText(raw);
  if (text.length < MIN_ANSWER || text.length > MAX_ANSWER || text.includes("```")) return null;
  if (text.split(" ").length < 3) return null;
  if (UNSAFE.test(text)) return null;
  const lower = normalizedForRules(text);
  if (LOW_EFFORT.test(lower) || isQuestion(text)) return null;
  if (!/[\p{L}\p{N}]{2,}/u.test(text)) return null;
  return text;
}

export { MAX_ANSWER, isQuestion, learnableAnswer, learnableQuestion, plainText };
