type ChatbotAccess = "staff" | "roles" | "everyone";

interface ChatbotConfig {
  /** Who may talk to the chatbot: staff only, staff plus `roleIds`, or every member. */
  access: ChatbotAccess;
  roleIds: readonly string[];
  /** Channels where mentions are answered. Empty means every channel the bot can read. */
  channelIds: readonly string[];
  /** Seconds a member waits between two answers. Staff wait too, so a loop can't spam. */
  cooldownSeconds: number;
}

const DISCORD_ID = /^\d{17,20}$/;

/** The homemade chatbot is on unless `CHATBOT_ENABLED=false`; by default only staff can use it. */
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
  });
}

function parseAccess(value: string | undefined): ChatbotAccess {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "staff";
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

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`);
  return parsed;
}

export { loadChatbotConfig };
export type { ChatbotAccess, ChatbotConfig };
