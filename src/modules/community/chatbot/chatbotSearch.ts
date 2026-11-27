import { cleanText } from "./chatbotIntents";

/**
 * Turns how people ask for a search into what to search for. "@bot who is IShowSpeed from
 * youtube google it" is a search for "ishowspeed" with the hint "youtube": the hint helps the
 * search rank the right page, but only the subject decides whether a result is about it.
 */

interface SearchRequest {
  subject: string;
  hint?: string;
}

const COMMAND = /\b(?:(?:can|could|would) (?:you|u) |please |pls |go )*(?:google|search(?: up)?|look(?:\s*up)?|wiki(?:pedia)?|duckduckgo|bing)(?: (?:it|that|this|them|him|her))?(?: up)?(?: (?:on|in) (?:google|the web|the internet|online|wikipedia))?(?: for me)?(?: for)?(?: please| pls)?\b/g;
const QUESTION_LEAD = /^(?:(?:hey|hi|yo|so|ok|okay|um|hmm|bro|btw|and|also)\s+)*(?:(?:do you|can you|could you) )?(?:know |tell me |explain |show me |find |find out )?(?:about |anything about )?(?:(?:who|what|where|when|why|how)(?: (?:is|are|was|were|does|do|did|exactly))?\b\s*|(?:whos|whats|wheres|hows|is|are)\b\s*)?(?:(?:a|an|the)\s+)?/;
const PLATFORM = /\b(?:from|on|of|in)\s+(youtube|twitch|tiktok|twitter|instagram|kick|reddit|netflix|steam|spotify)\b/;
const DESCRIPTOR = /\b(?:the\s+)?(youtuber|streamer|rapper|singer|actor|actress|band|game|movie|film|show|series|book|novel|author|character|boxer|footballer|player|company|app|website|song|album|city|country)$/;
const LEADING_DESCRIPTOR = /^(?:the\s+)?(game|movie|film|show|series|book|novel|song|album|band|app|youtuber|streamer|rapper|singer|actor|actress)\s+(?=\S)/;
const TRAILING = /\s+(?:mean|means|work|works|do|is|are|anyway|lol|bro|pls|please)$/;

function parseSearchRequest(raw: string): SearchRequest {
  let text = cleanText(raw).replace(COMMAND, " ").replace(/\s+/g, " ").trim();
  const hints: string[] = [];

  const platform = PLATFORM.exec(text);
  if (platform) {
    hints.push(platform[1]!);
    text = text.replace(platform[0], " ").replace(/\s+/g, " ").trim();
  }
  for (let round = 0; round < 3; round += 1) {
    const before = text;
    text = text.replace(QUESTION_LEAD, "").replace(TRAILING, "").trim();
    const descriptor = DESCRIPTOR.exec(text);
    // Keep a descriptor that is the whole subject ("the game"), drop it when it follows a name ("ksi the youtuber").
    if (descriptor && text.length > descriptor[0].length + 1) {
      hints.push(descriptor[1]!);
      text = text.slice(0, descriptor.index).trim();
    }
    const leading = LEADING_DESCRIPTOR.exec(text);
    if (leading) {
      hints.push(leading[1]!);
      text = text.slice(leading[0].length).trim();
    }
    if (text === before) break;
  }
  const subject = text.replace(/^(?:a|an|the)\s+/, "").replace(/\s+/g, " ").trim();
  return { subject, ...(hints.length ? { hint: [...new Set(hints)].join(" ") } : {}) };
}

export { parseSearchRequest };
export type { SearchRequest };
