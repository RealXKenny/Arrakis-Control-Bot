type ChatbotAccess = "staff" | "roles" | "everyone";

interface ChatbotConfig {
  /** Who may talk to the chatbot: staff only, staff plus `roleIds`, or every member. */
  access: ChatbotAccess;
  roleIds: readonly string[];
  /** Channels where mentions are answered. Empty means every channel the bot can read. */
  channelIds: readonly string[];
  /** Seconds a member waits between two answers. Staff wait too, so a loop can't spam. */
  cooldownSeconds: number;
  /** Learn questions and the answers members give them from public chat. Needs PostgreSQL. */
  learn: boolean;
  /** Channels to learn from. Empty means every channel @everyone can see. */
  learnChannelIds: readonly string[];
  /** Most learned answers kept per server; the oldest unused ones go first. */
  learnLimit: number;
  /** Answer questions in chat by itself, without a mention or /chat, when it is confident. */
  autoReply: boolean;
  /** Channels for automatic answers. Empty means every channel @everyone can see. */
  autoChannelIds: readonly string[];
  /** Match score from 0 to 1 an answer needs before the bot speaks up unasked. */
  autoConfidence: number;
  /** Seconds to wait so a member can answer first; any other member's message cancels it. */
  autoDelaySeconds: number;
  /** Seconds between two automatic answers in the same channel. */
  autoCooldownSeconds: number;
}

const DISCORD_ID = /^\d{17,20}$/;

/** The homemade chatbot is on unless `CHATBOT_ENABLED=false`; by default every member can talk to it. */
function loadChatbotConfig(env: NodeJS.ProcessEnv): ChatbotConfig | undefined {
  if (!parseFlag(env.CHATBOT_ENABLED, true, "CHATBOT_ENABLED")) return undefined;
  const access = parseAccess(env.CHATBOT_ACCESS);
  const roleIds = parseIds(env.CHATBOT_ROLE_IDS, "CHATBOT_ROLE_IDS");
  if (access === "roles" && roleIds.length === 0) throw new Error("CHATBOT_ROLE_IDS must list at least one role when CHATBOT_ACCESS is roles.");
  return Object.freeze({
    access,
    roleIds: Object.freeze(roleIds),
    channelIds: Object.freeze(parseIds(env.CHATBOT_CHANNEL_IDS, "CHATBOT_CHANNEL_IDS")),
    cooldownSeconds: parseInteger(env.CHATBOT_COOLDOWN_SECONDS, 3, 0, 600, "CHATBOT_COOLDOWN_SECONDS"),
    learn: parseFlag(env.CHATBOT_LEARN, true, "CHATBOT_LEARN"),
    learnChannelIds: Object.freeze(parseIds(env.CHATBOT_LEARN_CHANNEL_IDS, "CHATBOT_LEARN_CHANNEL_IDS")),
    learnLimit: parseInteger(env.CHATBOT_LEARN_LIMIT, 5_000, 100, 50_000, "CHATBOT_LEARN_LIMIT"),
    autoReply: parseFlag(env.CHATBOT_AUTO_REPLY, true, "CHATBOT_AUTO_REPLY"),
    autoChannelIds: Object.freeze(parseIds(env.CHATBOT_AUTO_CHANNEL_IDS, "CHATBOT_AUTO_CHANNEL_IDS")),
    autoConfidence: parseNumber(env.CHATBOT_AUTO_CONFIDENCE, 0.5, 0.2, 1, "CHATBOT_AUTO_CONFIDENCE"),
    autoDelaySeconds: parseInteger(env.CHATBOT_AUTO_DELAY_SECONDS, 15, 0, 300, "CHATBOT_AUTO_DELAY_SECONDS"),
    autoCooldownSeconds: parseInteger(env.CHATBOT_AUTO_COOLDOWN_SECONDS, 60, 0, 3_600, "CHATBOT_AUTO_COOLDOWN_SECONDS"),
  });
}

function parseAccess(value: string | undefined): ChatbotAccess {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "everyone";
  if (normalized === "staff" || normalized === "roles" || normalized === "everyone") return normalized;
  throw new Error("CHATBOT_ACCESS must be staff, roles or everyone.");
}

function parseFlag(value: string | undefined, fallback: boolean, name: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function parseIds(value: string | undefined, name: string): string[] {
  const ids = [...new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (ids.length > 50 || ids.some((id) => !DISCORD_ID.test(id))) throw new Error(`${name} must be up to 50 comma-separated Discord IDs.`);
  return ids;
}

function parseNumber(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be a number from ${minimum} to ${maximum}.`);
  return parsed;
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`);
  return parsed;
}

export { loadChatbotConfig };
export type { ChatbotAccess, ChatbotConfig };
