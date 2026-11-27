import type { SmallTalk } from "./chatbotIntents";

/**
 * Hand-written phrase banks. `{name}` is the asker's display name and `{server}` the Discord
 * server's name. A seeded pick keeps one message's answer stable while still varying replies.
 */

type Bank = readonly string[];

const SMALL_TALK: Readonly<Record<SmallTalk, Bank>> = Object.freeze({
  greeting: [
    "Hey {name}! What can I do for you?",
    "Hi {name}. Ask me about the server, your level, the next storm, or anything in the FAQ.",
    "Hello {name}, the spice must flow and so must the chat. What's up?",
    "Hey there {name}. Need something looked up?",
  ],
  howAreYou: [
    "Running smooth, {name}. No sandworms in my logs today. How about you?",
    "All systems green. Hydrated, even, which is rare on Arrakis. You?",
    "Doing well, thanks for asking {name}. What can I help with?",
    "Pretty good. Just keeping an eye on {server}. How's your day going?",
  ],
  identity: [
    "I'm Arrakis Control, the bot that runs {server}. I'm homemade: no outside AI, just what the bot knows plus what staff teach me.",
    "Arrakis Control, at your service. I live in this server, I know the FAQ, the commands and the live game server, and staff can teach me more.",
    "I'm the {server} bot. Not a person, not a big AI, just a well-read set of rules with a sense of humor.",
  ],
  capabilities: [
    "Here's what I can do, {name}:\n- Answer server questions from the FAQ and anything staff taught me\n- Tell you which command does what\n- Your level and XP, the level and Solari leaderboards\n- Game server status, the next Coriolis storm, what's new in the latest update\n- Item IDs, quick math, dice, coin flips and picking between options\n\nJust mention me or reply to one of my messages.",
  ],
  joke: [
    "Why did the sandworm break up with the harvester? It felt used for its spice.",
    "I tried to tell a joke about water discipline, but it didn't land. Too dry.",
    "How does a Fremen fix a broken stillsuit? With a little sietch-ing.",
    "What do you call a Harkonnen who's always on time? Baron-ly late.",
    "I'd tell you a UDP joke, but you might not get it.",
    "Why don't sandworms use the internet? Too much thumping in the network.",
    "My code has no bugs. It just has undocumented features that bite.",
    "How many Bene Gesserit does it take to change a light bulb? None. They've been planning the change for ten thousand years.",
  ],
  fact: [
    "Fun fact: a Coriolis storm on Arrakis can reach winds of 700 km/h, enough to strip flesh from bone.",
    "Fun fact: the Fremen word for a sandworm is Shai-Hulud, \"old man of the desert\".",
    "Fun fact: a well-fitted stillsuit loses only about a thimble of water a day.",
    "Fun fact: spice melange extends life and expands consciousness. Side effects include blue eyes.",
    "Fun fact: a thumper's rhythm is what calls a worm. Walk without rhythm and it won't find you.",
    "Fun fact: Arrakis has no open water at all, which is why water debts matter so much to the Fremen.",
  ],
  compliment: [
    "Thanks {name}, that made my day. I'll pass it on to the logs.",
    "You're too kind. I'm only as good as the people who keep me running.",
    "Appreciate it {name}! You're pretty great yourself.",
  ],
  insult: [
    "Ouch. I'm still learning, {name}. If I got something wrong, staff can teach me the right answer.",
    "Fair. Tell me what you expected and I'll try to do better.",
    "I'll take that as feedback. Even the best stillsuit leaks a little.",
  ],
  thanks: [
    "Anytime, {name}!",
    "You're welcome. Water and answers, always shared.",
    "Happy to help {name}.",
    "No problem. Ping me if you need anything else.",
  ],
  farewell: [
    "See you around, {name}. Walk without rhythm.",
    "Bye {name}! Stay hydrated out there.",
    "Later {name}. May your spice harvest be plentiful.",
  ],
  affirm: [
    "👍",
    "Got it.",
    "Alright {name}. Anything else?",
  ],
});

const UNKNOWN: Bank = [
  "I don't know that one yet, {name}.",
  "Hmm, that's outside what I know right now, {name}.",
  "I couldn't find anything on that, {name}.",
  "That one stumps me, {name}.",
];

const EIGHT_BALL: Bank = [
  "It is certain.", "Without a doubt.", "The spice says yes.", "Most likely.", "Signs point to yes.",
  "Reply hazy, a storm is passing. Try again.", "Ask again later.", "Better not tell you now.",
  "Don't count on it.", "My sources say no.", "Very doubtful.", "The sandworm shakes its head.",
];

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function pick(bank: Bank, random: () => number): string {
  return bank[Math.floor(random() * bank.length)] ?? bank[0] ?? "";
}

function fill(template: string, values: { name: string; server: string }): string {
  return template.replaceAll("{name}", values.name).replaceAll("{server}", values.server);
}

export { EIGHT_BALL, SMALL_TALK, UNKNOWN, fill, pick, seededRandom };
export type { Bank };
