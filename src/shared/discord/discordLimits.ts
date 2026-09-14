const DISCORD_LIMITS = {
  messageContent: 2_000,
  componentDisplayableText: 4_000,
  componentCount: 40,
  defaultAttachmentBytes: 10 * 1024 * 1024,
  requestBytes: 25 * 1024 * 1024,
} as const;

const DEFAULT_TRUNCATION_SUFFIX = "\n\n_Additional content omitted to fit Discord's display limit._";

function truncateDiscordText(value: string, maximumLength: number, suffix = DEFAULT_TRUNCATION_SUFFIX): string {
  const characters = Array.from(value);

  if (characters.length <= maximumLength) return value;
  if (maximumLength <= 0) return "";

  const suffixCharacters = Array.from(suffix);
  if (maximumLength <= suffixCharacters.length) return suffixCharacters.slice(0, maximumLength).join("");

  const contentLimit = maximumLength - suffixCharacters.length;
  const candidate = characters.slice(0, contentLimit).join("");
  const lastBoundary = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
  const content = lastBoundary >= Math.floor(contentLimit * 0.6) ? candidate.slice(0, lastBoundary) : candidate;

  return content.trimEnd() + suffix;
}

function countDisplayableText(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, child) => total + countDisplayableText(child), 0);
  if (!value || typeof value !== "object") return 0;

  const record = value as Record<string, unknown>;
  const ownText = [record.content, record.label, record.description]
    .filter((item): item is string => typeof item === "string")
    .reduce((total, item) => total + Array.from(item).length, 0);

  return ownText + Object.entries(record)
    .filter(([key]) => key !== "content" && key !== "label" && key !== "description")
    .reduce((total, [, child]) => total + countDisplayableText(child), 0);
}

function countComponents(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, child) => total + countComponents(child), 0);
  if (!value || typeof value !== "object") return 0;

  const record = value as Record<string, unknown>;
  const own = typeof record.type === "number" ? 1 : 0;
  return own + Object.entries(record)
    .filter(([key]) => key !== "type")
    .reduce((total, [, child]) => total + countComponents(child), 0);
}

function sanitizeAttachmentName(value: string | null | undefined, fallback = "attachment", maximumLength = 100): string {
  const withoutControls = Array.from((value ?? "").normalize("NFKC"))
    .map((character) => (character.codePointAt(0)! < 32 ? "-" : character))
    .join("");
  const normalized = withoutControls
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^-+|-+$/g, "") || fallback;
  const extensionMatch = normalized.match(/(\.[a-z0-9]{1,10})$/i);
  const extension = extensionMatch?.[1] ?? "";
  const stem = extension ? normalized.slice(0, -extension.length) : normalized;
  const stemLimit = Math.max(1, maximumLength - extension.length);

  return `${Array.from(stem).slice(0, stemLimit).join("")}${extension}`;
}

export { DEFAULT_TRUNCATION_SUFFIX, DISCORD_LIMITS, countComponents, countDisplayableText, sanitizeAttachmentName, truncateDiscordText };
