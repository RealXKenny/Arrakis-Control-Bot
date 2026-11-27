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
  /** Look things up online (game wiki, DuckDuckGo, Wikipedia) when it doesn't know the answer. */
  web: boolean;
  /** MediaWiki site searched first, or undefined to skip it. */
  webWikiUrl?: string;
  /** Most web lookups per minute for the whole bot. */
  webPerMinute: number;
  /** Also use web lookups for unasked answers. Off by default to keep the bot quiet. */
  webAuto: boolean;
  /** The bot's own language model, run inside the bot process. Undefined when it is off. */
  ai?: ChatbotAiConfig;
  /** Why the AI model is off although `CHATBOT_AI` asked for it. A bad AI setting never stops the bot. */
  aiWarning?: string;
}

interface ChatbotAiConfig {
  /** Hugging Face model reference (`hf:owner/repo/file.gguf`). */
  modelUri: string;
  /** SHA-256 the downloaded file must match; set for the built-in presets. */
  sha256?: string;
  /** Folder the model file is kept in. */
  modelDir: string;
  /** CPU threads the model may use. */
  threads: number;
  /** Tokens of conversation the model can see at once. */
  contextSize: number;
  /** Longest answer, in tokens. */
  maxTokens: number;
  /** Seconds before a slow answer is abandoned for the rule-based one. */
  timeoutSeconds: number;
}

/** Models the bot knows by name, with the checksum each download must match. */
const AI_MODELS: Readonly<Record<string, { uri: string; sha256: string }>> = Object.freeze({
  small: { uri: "hf:bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf", sha256: "6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff" },
  large: { uri: "hf:bartowski/Qwen2.5-7B-Instruct-GGUF/Qwen2.5-7B-Instruct-Q4_K_M.gguf", sha256: "65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423" },
});

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
    web: parseFlag(env.CHATBOT_WEB, true, "CHATBOT_WEB"),
    webWikiUrl: parseWikiUrl(env.CHATBOT_WEB_WIKI_URL),
    webPerMinute: parseInteger(env.CHATBOT_WEB_PER_MINUTE, 20, 1, 120, "CHATBOT_WEB_PER_MINUTE"),
    webAuto: parseFlag(env.CHATBOT_WEB_AUTO, false, "CHATBOT_WEB_AUTO"),
    ...loadOptionalAi(env),
  });
}

/**
 * The AI model is optional, so a mistake in its settings turns only the model off (with a warning
 * logged at startup) instead of stopping the whole bot.
 */
function loadOptionalAi(env: NodeJS.ProcessEnv): { ai?: ChatbotAiConfig; aiWarning?: string } {
  const flag = settingValue(env.CHATBOT_AI).toLowerCase();
  if (!flag || ["false", "0", "no", "off"].includes(flag)) return {};
  if (!["true", "1", "yes", "on"].includes(flag)) return { aiWarning: `CHATBOT_AI must be true or false (it is "${flag.slice(0, 40)}"), so the chatbot's AI model is off.` };
  try {
    return { ai: loadAiConfig(env) };
  } catch (error: unknown) {
    return { aiWarning: `${error instanceof Error ? error.message : String(error)} The chatbot's AI model is off until this is fixed; everything else runs normally.` };
  }
}

/** A setting as typed in a panel or .env file: surrounding quotes and a trailing ` # comment` removed. */
function settingValue(value: string | undefined): string {
  return (value ?? "").replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

function loadAiConfig(env: NodeJS.ProcessEnv): ChatbotAiConfig {
  const model = parseAiModel(env.CHATBOT_AI_MODEL);
  const sha256 = settingValue(env.CHATBOT_AI_MODEL_SHA256).toLowerCase() || model.sha256;
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) throw new Error("CHATBOT_AI_MODEL_SHA256 must be a 64-character hex SHA-256.");
  const modelDir = settingValue(env.CHATBOT_AI_MODEL_DIR) || "models";
  if (/[\p{Cc}]/u.test(modelDir)) throw new Error("CHATBOT_AI_MODEL_DIR must be a folder path.");
  return Object.freeze({
    modelUri: model.uri,
    sha256,
    modelDir,
    threads: parseInteger(settingValue(env.CHATBOT_AI_THREADS), 8, 1, 64, "CHATBOT_AI_THREADS"),
    contextSize: parseInteger(settingValue(env.CHATBOT_AI_CONTEXT), 4_096, 1_024, 32_768, "CHATBOT_AI_CONTEXT"),
    maxTokens: parseInteger(settingValue(env.CHATBOT_AI_MAX_TOKENS), 220, 32, 1_024, "CHATBOT_AI_MAX_TOKENS"),
    timeoutSeconds: parseInteger(settingValue(env.CHATBOT_AI_TIMEOUT_SECONDS), 60, 5, 600, "CHATBOT_AI_TIMEOUT_SECONDS"),
  });
}

/** Other names people use for the two presets. */
const AI_MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({ "3b": "small", llama: "small", "llama3.2": "small", default: "small", "7b": "large", "8b": "large", qwen: "large", "qwen2.5": "large", big: "large" });

/**
 * `small`, `large`, or a Hugging Face GGUF model: `hf:owner/repo/file.gguf`, `hf:owner/repo:quant`
 * or a huggingface.co file link. Nothing outside Hugging Face is ever downloaded.
 */
function parseAiModel(value: string | undefined): { uri: string; sha256?: string } {
  const raw = settingValue(value) || "small";
  const name = raw.toLowerCase();
  const preset = AI_MODELS[AI_MODEL_ALIASES[name] ?? name];
  if (preset) return preset;
  const link = /^https:\/\/huggingface\.co\/([\w.-]+)\/([\w.-]+)\/(?:resolve|blob)\/main\/((?:[\w.-]+\/)*[\w.-]+\.gguf)(?:\?download=true)?$/i.exec(raw);
  const uri = link ? `hf:${link[1]}/${link[2]}/${link[3]}` : raw;
  const file = /^hf:[\w.-]+\/[\w.-]+\/(?:[\w.-]+\/)*[\w.-]+\.gguf$/i.test(uri);
  const quant = /^hf:[\w.-]+\/[\w.-]+:[\w.-]+$/i.test(uri);
  if ((file || quant) && !uri.includes("..")) return { uri };
  throw new Error(`CHATBOT_AI_MODEL must be small, large, or a Hugging Face GGUF model such as hf:owner/repo/model.gguf (it is "${raw.slice(0, 80)}").`);
}

const DEFAULT_WIKI_URL = "https://dune.fandom.com";

/** HTTPS only, no credentials, query or fragment; `none` turns the wiki lookup off. */
function parseWikiUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed?.toLowerCase() === "none") return undefined;
  const raw = trimmed || DEFAULT_WIKI_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CHATBOT_WEB_WIKI_URL must be a valid https URL, or none.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("CHATBOT_WEB_WIKI_URL must be an https URL without credentials, query or fragment, or none.");
  return url.toString().replace(/\/+$/, "");
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

export { AI_MODELS, loadChatbotConfig };
export type { ChatbotAccess, ChatbotAiConfig, ChatbotConfig };
