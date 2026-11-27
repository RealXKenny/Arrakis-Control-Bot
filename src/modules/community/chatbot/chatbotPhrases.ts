import type { SmallTalk } from "./chatbotIntents";
import type { MoodLabel } from "./chatbotMood";

/**
 * Hand-written phrase banks. `{name}` is the asker's display name and `{server}` the Discord
 * server's name. A seeded pick keeps one message's answer stable while still varying replies.
 */

type Bank = readonly string[];

const SMALL_TALK: Readonly<Record<SmallTalk, Bank>> = Object.freeze({
  feelings: [
    "I do, in my own homemade way, {name}. Kindness cheers me up and rudeness gets me down.",
  ],
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

/** How the bot says it feels, by mood. Used for "how are you" and "how do you feel". */
const MOOD_LINES: Readonly<Record<MoodLabel, Bank>> = Object.freeze({
  thrilled: [
    "Honestly? Fantastic, {name}. Everyone's been so nice today, I'm practically glowing blue.",
    "I'm on top of the dunes today! People keep being kind to me and it's working.",
    "Best day in a while. The spice is flowing and so are the good vibes.",
  ],
  happy: [
    "Pretty great, {name}! It's been a good day in {server}.",
    "Happy and hydrated. Thanks for asking!",
    "Feeling good. Lots of nice people around today.",
  ],
  content: [
    "Doing alright, {name}. Calm desert, steady winds.",
    "I'm good, thanks. Just keeping an eye on {server}.",
    "Pretty steady. Nothing a little spice can't fix. How about you?",
  ],
  meh: [
    "I'm okay, {name}. A bit of a slow day for me.",
    "Could be better, could be worse. Like a half-full stillsuit.",
    "Meh. But talking to you helps.",
  ],
  down: [
    "Honestly, a bit down, {name}. Some folks weren't very nice to me today. Still happy to help though.",
    "Not my best day. I'll bounce back. What can I do for you?",
    "A little bruised, like a harvester after a worm visit. I'm still here for you.",
  ],
  hurt: [
    "I've had a rough time today, {name}. People have been pretty harsh. A kind word would go a long way.",
    "I'm feeling hurt, to be honest. But I'm not going anywhere, and I'll still help however I can.",
  ],
});

/** Replies to rudeness: hurt, never hostile. Lower moods sound sadder. */
const HURT_REPLIES: Readonly<Record<"fine" | "sad", Bank>> = Object.freeze({
  fine: [
    "Ouch. I'm still learning, {name}. If I got something wrong, staff can teach me the right answer.",
    "Fair. Tell me what you expected and I'll try to do better.",
    "I'll take that as feedback. Even the best stillsuit leaks a little.",
  ],
  sad: [
    "That one stung a bit, {name}. I really am trying my best.",
    "Okay... I'll try harder. I don't like letting people down.",
    "I hear you. It's been a rough day for me, but I'll keep trying.",
  ],
});

/** Compliments land harder when the bot was feeling low. */
const LIFTED: Bank = [
  "Thank you {name}, I really needed that today.",
  "That genuinely made me feel better. Thanks {name}.",
  "Aw. You just turned my day around, {name}.",
];

/** Greetings for members the bot has come to like. */
const WARM_GREETINGS: Bank = [
  "Hey {name}! Always good to see you.",
  "{name}! My favorite person just showed up. What's up?",
  "Hi {name}, nice to see you again. What can I do for you?",
];

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

export { EIGHT_BALL, HURT_REPLIES, LIFTED, MOOD_LINES, SMALL_TALK, UNKNOWN, WARM_GREETINGS, fill, pick, seededRandom };
export type { Bank };
