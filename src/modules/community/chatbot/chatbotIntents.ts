/**
 * Works out what a member is asking the chatbot. A small, ordered rule set catches the things
 * the bot can look up or do itself; anything else falls through to the knowledge search. It
 * is plain pattern matching: fast, predictable and easy to extend with one more line.
 */

type ChatIntent =
  | { kind: "level"; userId?: string }
  | { kind: "levelTop" }
  | { kind: "solariTop" }
  | { kind: "storm" }
  | { kind: "serverStatus" }
  | { kind: "botInfo" }
  | { kind: "whatsNew" }
  | { kind: "item"; query: string }
  | { kind: "math"; expression: string }
  | { kind: "dice"; count: number; sides: number }
  | { kind: "coin" }
  | { kind: "choose"; options: string[] }
  | { kind: "eightBall" }
  | { kind: "time" }
  | { kind: "more" }
  | { kind: "followUp"; userId: string }
  | { kind: "feelings" }
  | { kind: "identity" }
  | { kind: "capabilities" }
  | { kind: "howAreYou" }
  | { kind: "joke" }
  | { kind: "fact" }
  | { kind: "compliment" }
  | { kind: "insult" }
  | { kind: "greeting" }
  | { kind: "thanks" }
  | { kind: "farewell" }
  | { kind: "affirm" }
  | { kind: "unknown" };

type SmallTalk = Extract<ChatIntent["kind"], "feelings" | "identity" | "capabilities" | "howAreYou" | "joke" | "fact" | "compliment" | "insult" | "greeting" | "thanks" | "farewell" | "affirm">;

const MENTION = /<@!?(\d{17,20})>/g;
const MAX_DICE = 20;
const MAX_SIDES = 1_000;
/** Small talk only wins over the knowledge search in short messages. */
const SMALL_TALK_WORDS = 6;

const SMALL_TALK: readonly [SmallTalk, RegExp][] = [
  ["feelings", /\bhow (do|are) (you|u) feel(ing)?\b|\b(do|can) (you|u) (have|feel) (feelings|emotions)\b|\b(your|ur) (mood|feelings)\b|\bare (you|u) (happy|sad|ok|okay|alright|mad|angry|upset|lonely)\b|\bwhats (your|ur) mood\b/],
  ["identity", /\b(who|what) (are|r) (you|u)\b|\byour name\b|\bare you (a bot|an ai|real|human|alive|sentient)\b|\bwho (made|built|created) you\b/],
  ["capabilities", /^(help|commands?|menu)$|\bwhat (can|do) you (do|know)\b|\bhow do (i|you) (use|talk to) you\b|\bwhat are you (for|good at)\b/],
  ["howAreYou", /\bhow (are|r) (you|u|ya)\b|\bhow ?s it going\b|\bhow are things\b|\bwhats up\b|\bwassup\b|\bhows (your|ur) day\b|^sup$/],
  ["joke", /\bjoke\b|\bmake me (laugh|smile)\b|\bsomething funny\b|\bpun\b/],
  ["fact", /\b(fun |random )?fact\b|\btell me something( interesting)?\b|\blore\b/],
  ["compliment", /\bgood (bot|job)\b|\byou( are|re) (great|awesome|the best|smart|cool|amazing|funny|helpful)\b|\b(love|like) you\b|\bwell done\b/],
  ["insult", /\bbad bot\b|\b(you( are|re)|ur) (stupid|dumb|useless|trash|bad)\b|\byou suck\b|\bidiot\b|\bshut up\b/],
  ["thanks", /\b(thanks?|thank (you|u)|thx|ty|tysm|cheers|appreciate (it|you))\b/],
  ["farewell", /^(bye|goodbye|good ?bye|see (ya|you)|later|cya|good ?night|gn|night|ttyl)\b/],
  ["greeting", /^(hi|hey|hello|heya|hiya|yo|howdy|greetings|sup|good (morning|afternoon|evening))\b/],
  ["affirm", /^(ok|okay|k|cool|nice|great|sweet|awesome|lol|lmao|haha+|yes|yeah|yep|no|nope|nah|sure|alright|wow)$/],
];

/** Lowercase, drop mentions, links and punctuation noise, and collapse whitespace. */
function cleanText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(MENTION, " ")
    .replace(/<[#@][&!]?\d+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[!?.,;:]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** User IDs mentioned in the message, without the bot's own. */
function mentionedUserIds(value: string, botId?: string): string[] {
  return [...new Set([...value.matchAll(MENTION)].map((match) => match[1]!).filter((id) => id !== botId))];
}

function detectIntent(raw: string, botId?: string): ChatIntent {
  const text = cleanText(raw);
  const others = mentionedUserIds(raw, botId);
  if (!text && others.length === 0) return { kind: "greeting" };

  const math = extractMath(raw);
  if (math) return { kind: "math", expression: math };

  if (/^(what|how) about\b|^and( for)?\b/.test(text) && others.length > 0 && text.split(" ").length <= 4) return { kind: "followUp", userId: others[0]! };
  if (/^(more|tell me more|go on|keep going|continue|what else|anything else|next|and)$/.test(text)) return { kind: "more" };

  if (/\b(level|xp)\b.*\b(leaderboard|top|ranking|highest)\b|\b(leaderboard|top|ranking|highest)\b.*\b(level|levels|xp)\b|\bmost active\b/.test(text)) return { kind: "levelTop" };
  const asksLevel = /\b(my|whats my|what is my|check my|show my) (level|rank|xp)\b|\bwhat (level|rank) am i\b|\bhow much xp (do i|have i)\b|\b(level|rank|xp) (of|for)\b/.test(text)
    || (others.length > 0 && /\b(level|rank|xp)\b/.test(text));
  if (asksLevel) return others[0] ? { kind: "level", userId: others[0] } : { kind: "level" };
  if (/\b(richest|solari|solaris)\b|\b(leaderboard|top players)\b/.test(text)) return { kind: "solariTop" };
  if (/\b(coriolis|storm|storms)\b/.test(text)) return { kind: "storm" };
  if (/\bserver(s)?\b.*\b(up|down|online|offline|status|working|running|alive|lagging|dead)\b|\b(is|are) (the )?(game|servers?) (up|down|online)\b|\bhow many (players|people)\b|\b(population|player count|whos (on|online|playing))\b/.test(text)) return { kind: "serverStatus" };
  if (/\b(whats new|what is new|changelog|patch notes|release notes|latest (update|version|release)|what changed|new features?)\b/.test(text)) return { kind: "whatsNew" };
  if (/\b(your|bot) (version|uptime|ping|latency)\b|\bwhat version\b|\buptime\b|\bping\b|\blatency\b|\bhow long have you been (up|online|running)\b/.test(text)) return { kind: "botInfo" };

  const item = /\b(?:item )?(?:template )?id (?:for|of) (?:the |an? )?(.{2,60})$/.exec(text) ?? /^(?:find|look ?up|search(?: for)?) (?:the |an? )?item (.{2,60})$/.exec(text);
  if (item?.[1]) return { kind: "item", query: item[1].trim() };

  const dice = /\broll(?: me)?(?: an?| the)?\s*(\d{0,3})\s*d(\d{1,6})\b/.exec(text);
  if (dice) {
    const count = Math.min(Math.max(Number(dice[1] || 1), 1), MAX_DICE);
    const sides = Math.min(Math.max(Number(dice[2]), 2), MAX_SIDES);
    return { kind: "dice", count, sides };
  }
  if (/\broll(?: me)?(?: an?| the)? (dice|die)\b|^roll$/.test(text)) return { kind: "dice", count: 1, sides: 6 };
  if (/\b(flip|toss) (a |the )?coin\b|\bheads or tails\b|^coin ?flip$/.test(text)) return { kind: "coin" };
  // Commas separate the options, so read them from the text before punctuation is dropped.
  const listed = raw.replace(MENTION, " ").toLowerCase().replace(/[?!.]+\s*$/, "").replace(/\s+/g, " ").trim();
  const choose = /^(?:choose|pick|decide|which one|should i pick)[: ]+(.+)$/.exec(listed) ?? /^(?:should i|do i|is it|which is better)[: ]+(.+ or .+)$/.exec(listed);
  if (choose?.[1]) {
    const options = [...new Set(choose[1].split(/,|\bor\b/).map((option) => option.trim()).filter(Boolean))].slice(0, 10);
    if (options.length >= 2) return { kind: "choose", options };
  }
  if (/\b(8 ?ball|magic (8|eight)|eight ?ball)\b/.test(text)) return { kind: "eightBall" };
  if (/\bwhat time is it\b|\bwhats the (time|date)\b|\bwhat (is )?the (time|date)\b|\bwhat day is (it|today)\b|\btodays date\b/.test(text)) return { kind: "time" };

  if (text.split(" ").length <= SMALL_TALK_WORDS) {
    for (const [kind, pattern] of SMALL_TALK) if (pattern.test(text)) return { kind };
  }
  return { kind: "unknown" };
}

/** Small talk checked again after the knowledge search found nothing for a longer message. */
function detectSmallTalk(raw: string): SmallTalk | null {
  const text = cleanText(raw);
  for (const [kind, pattern] of SMALL_TALK) if (pattern.test(text)) return kind;
  return null;
}

/** A bare arithmetic question such as `what is 12 * (3 + 4)?`, returned as the expression. */
function extractMath(raw: string): string | null {
  const text = raw.replace(MENTION, " ").trim().toLowerCase();
  const match = /^(?:(?:what(?:'|’)?s|what is|calc(?:ulate)?|compute|solve|how much is)\s+)?([\d\s.+\-*/x×÷^%()]+?)\s*(?:=\s*)?\??$/.exec(text);
  const expression = match?.[1]?.replace(/[x×]/g, "*").replace(/÷/g, "/").trim();
  if (!expression || expression.length > 120 || !/\d/.test(expression) || !/\d\s*[+\-*/^%]\s*[\d(.-]/.test(expression)) return null;
  return expression;
}

export { cleanText, detectIntent, detectSmallTalk, extractMath, mentionedUserIds };
export type { ChatIntent, SmallTalk };
