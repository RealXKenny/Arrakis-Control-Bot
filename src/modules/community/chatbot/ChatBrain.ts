import { escapeMarkdown } from "discord.js";
import { detectIntent, detectSmallTalk, type ChatIntent } from "./chatbotIntents";
import { ANSWER_SCORE, type ChatKnowledge, type KnowledgeMatch } from "./chatbotKnowledge";
import { evaluateExpression, formatNumber } from "./chatbotMath";
import { moodLabel, type FeelingEvent } from "./chatbotMood";
import { EIGHT_BALL, HURT_REPLIES, LIFTED, MOOD_LINES, SMALL_TALK, UNKNOWN, WARM_GREETINGS, fill, pick, seededRandom } from "./chatbotPhrases";
import type { SmallTalk } from "./chatbotIntents";

/**
 * The homemade chatbot. It reads the message with simple rules, answers live questions through
 * the bot's own services (levels, leaderboards, storms, server status), and everything else
 * from the knowledge base. Nothing leaves the bot and nothing is invented: when it doesn't
 * know, it says so and points to where the answer might be.
 */

interface LevelInfo {
  level: number;
  xp: number;
  rank: number | null;
  nextLevelXp: number;
}

interface ChatSkills {
  level?(userId: string): Promise<LevelInfo | null>;
  levelTop?(): Promise<{ userId: string; level: number; xp: number }[]>;
  solariTop?(): Promise<{ name: string; balance: string }[]>;
  storm?(): Promise<{ start: number; end: number }>;
  serverStatus?(): Promise<{ overall: string; population: string; region: string }>;
  changelog?(): Promise<{ version: string; highlights: string[] } | null>;
  items?(query: string): { name: string; id: string; detail?: string }[];
  botInfo(): { version: string; uptimeMs: number; pingMs: number | null };
}

/** What the chatbot remembers about one member in one channel, for follow-up questions. */
interface ChatMemory {
  lastKind: ChatIntent["kind"];
  /** Knowledge entries from the last search, best first, and how many were shown. */
  matches?: string[];
  shown?: number;
  at: number;
}

interface ChatInput {
  text: string;
  /** Seeds the phrase choice, so one message always gets the same wording. */
  seed: string;
  userId: string;
  displayName: string;
  serverName: string;
  isStaff: boolean;
  botId?: string;
  memory?: ChatMemory;
  /** The bot's current mood score (-100 to 100) and its rapport with the asker (-50 to 50). */
  mood?: number;
  rapport?: number;
}

interface ChatReply {
  content: string;
  memory: ChatMemory;
  /** Knowledge entry the answer came from (such as `taught:7` or `learned:12`), so its use can be counted. */
  usedEntryId?: string;
  /** How the message made the bot feel, so its mood and rapport can be updated. */
  feeling?: FeelingEvent;
}

const MEMORY_TTL_MS = 10 * 60_000;
const FEELINGS: Partial<Record<SmallTalk, FeelingEvent>> = Object.freeze({ compliment: "compliment", thanks: "thanks", greeting: "greeting", insult: "insult", farewell: "farewell" });

class ChatBrain {
  public constructor(
    private readonly knowledge: () => ChatKnowledge,
    private readonly skills: ChatSkills,
    private readonly now: () => number = Date.now,
  ) {}

  public async reply(input: ChatInput): Promise<ChatReply> {
    const memory = input.memory && this.now() - input.memory.at < MEMORY_TTL_MS ? input.memory : undefined;
    let intent = detectIntent(input.text, input.botId);
    if (intent.kind === "followUp") intent = memory?.lastKind === "level" ? { kind: "level", userId: intent.userId } : { kind: "unknown" };
    const random = seededRandom(input.seed);
    const say = (template: string): string => fill(template, { name: escapeMarkdown(input.displayName), server: escapeMarkdown(input.serverName) });
    const done = (content: string, extra: Partial<ChatMemory> = {}): ChatReply => ({ content, memory: { lastKind: intent.kind, at: this.now(), ...extra } });

    try {
      switch (intent.kind) {
        case "level": return done(await this.level(intent.userId ?? input.userId, intent.userId === undefined || intent.userId === input.userId));
        case "levelTop": return done(await this.levelTop());
        case "solariTop": return done(await this.solariTop());
        case "storm": return done(await this.storm());
        case "serverStatus": return done(await this.serverStatus());
        case "whatsNew": return done(await this.whatsNew());
        case "botInfo": return done(this.botInfo());
        case "item": return done(this.items(intent.query));
        case "math": return done(math(intent.expression));
        case "dice": return done(dice(intent.count, intent.sides, random));
        case "coin": return done(random() < 0.5 ? "Heads." : "Tails.");
        case "choose": return done(`I pick **${escapeMarkdown(pick(intent.options, random))}**.`);
        case "eightBall": return done(pick(EIGHT_BALL, random));
        case "time": return done(`It's <t:${Math.floor(this.now() / 1_000)}:F> in your time zone.`);
        case "more": return this.more(memory, say);
        case "unknown": return this.answerFromKnowledge(input, random, say);
        default: return { ...done(say(this.smallTalk(intent.kind, input, random))), feeling: FEELINGS[intent.kind] ?? "chat" };
      }
    } catch {
      return done("I couldn't reach that information right now. Try again in a minute.");
    }
  }

  /**
   * The answer to a question nobody asked the bot directly, or null when it should stay quiet.
   * Only confident knowledge matches and read-only lookups qualify; no small talk, no guesses.
   */
  public async autoReply(input: ChatInput, threshold: number): Promise<ChatReply | null> {
    const intent = detectIntent(input.text, input.botId);
    const at = this.now();
    const lookups: readonly ChatIntent["kind"][] = ["storm", "serverStatus", "whatsNew", "solariTop", "levelTop"];
    if (lookups.includes(intent.kind)) {
      const reply = await this.reply(input);
      return reply.content.startsWith("I couldn't reach") || /isn't (turned on|available)|can't (see|check)/.test(reply.content) ? null : reply;
    }
    if (intent.kind !== "unknown") return null;
    const matches = this.knowledge().search(input.text, 3);
    const best = matches[0];
    if (!best || best.score < threshold) return null;
    // A close second means the question is ambiguous; better to stay quiet.
    const second = matches[1];
    if (second && second.entry.answer !== best.entry.answer && best.score - second.score < 0.05 && best.score < 0.9) return null;
    const say = (template: string): string => fill(template, { name: escapeMarkdown(input.displayName), server: escapeMarkdown(input.serverName) });
    return { content: formatAnswer(best, say), memory: { lastKind: "unknown", matches: matches.map((match) => match.entry.id), shown: 1, at }, usedEntryId: best.entry.id };
  }

  /** Small talk coloured by how the bot feels and how it gets on with the asker. */
  private smallTalk(kind: SmallTalk, input: ChatInput, random: () => number): string {
    const mood = moodLabel(input.mood ?? 20);
    const low = mood === "down" || mood === "hurt";
    if (kind === "howAreYou" || kind === "feelings") {
      const line = pick(MOOD_LINES[mood], random);
      return kind === "feelings" ? `${pick(SMALL_TALK.feelings, random)}\nRight now: ${line}` : line;
    }
    if (kind === "insult") return pick(HURT_REPLIES[low || (input.rapport ?? 0) < -20 ? "sad" : "fine"], random);
    if (kind === "compliment" && low) return pick(LIFTED, random);
    if (kind === "greeting" && (input.rapport ?? 0) >= 20) return pick(WARM_GREETINGS, random);
    return pick(SMALL_TALK[kind], random);
  }

  private answerFromKnowledge(input: ChatInput, random: () => number, say: (template: string) => string): ChatReply {
    const matches = this.knowledge().search(input.text, 5);
    const best = matches[0];
    const at = this.now();
    if (best && best.score >= ANSWER_SCORE) {
      return {
        content: formatAnswer(best, say),
        memory: { lastKind: "unknown", matches: matches.map((match) => match.entry.id), shown: 1, at },
        usedEntryId: best.entry.id,
      };
    }
    const smallTalk = detectSmallTalk(input.text);
    if (smallTalk) return { content: say(this.smallTalk(smallTalk, input, random)), memory: { lastKind: smallTalk, at }, feeling: FEELINGS[smallTalk] ?? "chat" };

    const lines = [say(pick(UNKNOWN, random))];
    if (matches.length > 0) lines.push(`Maybe one of these helps: ${matches.slice(0, 3).map((match) => `**${escapeMarkdown(match.entry.title)}**`).join(", ")}. Ask me about it, or say "more".`);
    else lines.push("Try `/help` for every command, or open a ticket if you need staff.");
    if (input.isStaff) lines.push("-# Staff: teach me this one with `/chat teach`.");
    return { content: lines.join("\n"), memory: { lastKind: "unknown", matches: matches.map((match) => match.entry.id), shown: 0, at } };
  }

  private more(memory: ChatMemory | undefined, say: (template: string) => string): ChatReply {
    const at = this.now();
    const next = memory?.matches?.[memory.shown ?? 0];
    const entry = next ? this.knowledge().get(next) : undefined;
    if (!memory || !entry) return { content: "That's everything I've got on that. Ask me something else?", memory: { lastKind: "more", at } };
    return {
      content: formatAnswer({ entry, score: 1 }, say),
      memory: { ...memory, shown: (memory.shown ?? 0) + 1, at },
      usedEntryId: entry.id,
    };
  }

  private async level(userId: string, self: boolean): Promise<string> {
    if (!this.skills.level) return "Leveling isn't turned on in this server.";
    const info = await this.skills.level(userId);
    const who = self ? "You're" : `<@${userId}> is`;
    if (!info || info.xp <= 0) return self ? "You haven't earned any XP yet. Chat and hang out in voice to start leveling." : `<@${userId}> hasn't earned any XP yet.`;
    const rank = info.rank ? `, rank **#${info.rank}**` : "";
    return `${who} level **${info.level}** with **${info.xp.toLocaleString("en-US")} XP**${rank}. ${Math.max(0, info.nextLevelXp - info.xp).toLocaleString("en-US")} XP to level ${info.level + 1}.`;
  }

  private async levelTop(): Promise<string> {
    if (!this.skills.levelTop) return "Leveling isn't turned on in this server.";
    const top = await this.skills.levelTop();
    if (top.length === 0) return "Nobody has earned XP yet.";
    return ["**Top levels**", ...top.map((entry, index) => `${index + 1}. <@${entry.userId}>: level ${entry.level} (${entry.xp.toLocaleString("en-US")} XP)`), "-# Full board: `/level leaderboard`"].join("\n");
  }

  private async solariTop(): Promise<string> {
    if (!this.skills.solariTop) return "The Solari leaderboard isn't available right now.";
    const top = await this.skills.solariTop();
    if (top.length === 0) return "I couldn't read any Solari balances right now.";
    return ["**Richest players**", ...top.map((entry, index) => `${index + 1}. ${escapeMarkdown(entry.name)}: ${entry.balance} Solari`), "-# Full board: `/leaderboard`"].join("\n");
  }

  private async storm(): Promise<string> {
    if (!this.skills.storm) return "I can't see the storm schedule right now.";
    const { start, end } = await this.skills.storm();
    const now = this.now();
    const s = Math.floor(start / 1_000);
    const e = Math.floor(end / 1_000);
    if (now < start) return `The next Coriolis storm starts <t:${s}:R> (<t:${s}:f>) and lasts until <t:${e}:f>.`;
    if (now < end) return `A Coriolis storm is raging right now. It ends <t:${e}:R> (<t:${e}:f>).`;
    return "The last Coriolis storm has passed. The next schedule will show up once the server publishes it.";
  }

  private async serverStatus(): Promise<string> {
    if (!this.skills.serverStatus) return "I can't check the game server from here.";
    const status = await this.skills.serverStatus();
    const ready = /ready|online|running|up/i.test(status.overall);
    const population = status.population && status.population !== "Unknown" ? ` Population: **${escapeMarkdown(status.population)}**.` : "";
    return `${ready ? "The game server is up" : `The game server reports **${escapeMarkdown(status.overall)}**`}${status.region && status.region !== "Unknown" ? ` (${escapeMarkdown(status.region)})` : ""}.${population}\n-# Full details: \`/server status\``;
  }

  private async whatsNew(): Promise<string> {
    const release = await this.skills.changelog?.();
    if (!release) return "I couldn't load the changelog right now. Check the announcements channel for release notes.";
    const highlights = release.highlights.slice(0, 4).map((line) => `- ${line}`);
    return [`**What's new in v${escapeMarkdown(release.version)}**`, ...(highlights.length ? highlights : ["- Small fixes and improvements."]), "-# Full notes are in the announcements channel."].join("\n");
  }

  private botInfo(): string {
    const info = this.skills.botInfo();
    const ping = info.pingMs === null ? "" : ` Gateway ping is ${info.pingMs} ms.`;
    return `I'm running **v${escapeMarkdown(info.version)}** and have been up for ${formatDuration(info.uptimeMs)}.${ping}`;
  }

  private items(query: string): string {
    const results = this.skills.items?.(query) ?? [];
    if (results.length === 0) return `I couldn't find an item called "${escapeMarkdown(query)}".`;
    const lines = results.slice(0, 5).map((item) => `- **${escapeMarkdown(item.name)}**: \`${item.id}\`${item.detail ? ` (${escapeMarkdown(item.detail)})` : ""}`);
    return [`Items matching "${escapeMarkdown(query)}":`, ...lines, ...(results.length > 5 ? [`-# ${results.length - 5} more. Be more specific to narrow it down.`] : [])].join("\n");
  }
}

function formatAnswer(match: KnowledgeMatch, say: (template: string) => string): string {
  const { entry } = match;
  if (entry.source === "faq") return `**${entry.title}**\n${entry.answer}`;
  // Learned answers are members' own words: shown as said, never filled in, and linked to the source.
  if (entry.source === "learned") return `${entry.answer}${entry.link ? `\n-# Learned from chat · ${entry.link}` : "\n-# Learned from chat"}`;
  return say(entry.answer);
}

function math(expression: string): string {
  const result = evaluateExpression(expression);
  if (result.ok) return `\`${expression.replace(/`/g, "")}\` = **${formatNumber(result.value)}**`;
  if (result.reason === "divideByZero") return "Dividing by zero? Not even the Kwisatz Haderach can do that.";
  if (result.reason === "tooLarge") return "That number is bigger than the Great Maker. Try something smaller.";
  return "I couldn't work that one out. I can do + - * / % ^ and brackets.";
}

function dice(count: number, sides: number, random: () => number): string {
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
  const total = rolls.reduce((sum, roll) => sum + roll, 0);
  return count === 1 ? `🎲 You rolled **${total}** (d${sides}).` : `🎲 ${count}d${sides}: ${rolls.join(", ")} = **${total}**`;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const parts = [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes % 60}m`].filter(Boolean);
  return parts.join(" ");
}

export { ChatBrain, MEMORY_TTL_MS };
export type { ChatInput, ChatMemory, ChatReply, ChatSkills, LevelInfo };
