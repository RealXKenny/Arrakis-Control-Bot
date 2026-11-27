import { LogLevel as SapphireLogLevel, type ILogger } from "@sapphire/framework";

const LEVELS = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
} as const);

type LogLevel = keyof typeof LEVELS;

const COLORS = Object.freeze({
  reset: "\u001B[0m",
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  magenta: "\u001B[35m",
  blue: "\u001B[34m",
  brightCyan: "\u001B[96m",
  brightGreen: "\u001B[92m",
  brightYellow: "\u001B[93m",
  brightMagenta: "\u001B[95m",
  brightBlue: "\u001B[94m",
  brightOrange: "\u001B[38;5;208m",
  white: "\u001B[37m",
});

const LEVEL_COLORS: Record<LogLevel, string> = Object.freeze({
  DEBUG: COLORS.magenta,
  INFO: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
  FATAL: COLORS.red,
});

const LEVEL_ICONS: Record<LogLevel, string> = Object.freeze({
  DEBUG: "◆",
  INFO: "●",
  WARN: "▲",
  ERROR: "✖",
  FATAL: "✖",
});

/**
 * Arrakis console style, shared with the bot (src/lib/logger.ts there). Keep the scope colours, layout, colour
 * policy and banner identical in both repositories so the two consoles read as one product.
 */
const SCOPE_COLORS: Record<string, string> = Object.freeze({
  // Products and startup
  BOT: COLORS.brightYellow,
  DASHBOARD: COLORS.brightOrange,
  STARTUP: COLORS.brightYellow,
  SYSTEM: COLORS.brightYellow,
  UPDATES: COLORS.brightYellow,
  RELEASES: COLORS.brightOrange,
  "VERSION ANNOUNCEMENTS": COLORS.brightOrange,
  CONFIG: COLORS.brightBlue,
  METRICS: COLORS.cyan,
  WORKERS: COLORS.cyan,
  // Discord
  DISCORD: COLORS.brightCyan,
  GATEWAY: COLORS.brightCyan,
  "SHARD MANAGER": COLORS.brightMagenta,
  SAPPHIRE: COLORS.magenta,
  COMMANDS: COLORS.brightBlue,
  COMPONENTS: COLORS.magenta,
  EVENTS: COLORS.green,
  INTERACTIONS: COLORS.cyan,
  "DISCORD ADAPTER": COLORS.brightCyan,
  "DISCORD AUDIT": COLORS.brightGreen,
  "DISCORD AUDIT LOG": COLORS.brightMagenta,
  // Game data
  "DUNE API": COLORS.yellow,
  "CONVOY API": COLORS.brightBlue,
  PLAYERS: COLORS.brightGreen,
  "PLAYER PANEL": COLORS.brightGreen,
  "BLUEPRINT PANEL": COLORS.yellow,
  MARKET: COLORS.brightOrange,
  SERVER: COLORS.yellow,
  "CORIOLIS STORM": COLORS.brightOrange,
  "SEASON CLAIMS": COLORS.brightOrange,
  // Storage and transport
  STORAGE: COLORS.brightGreen,
  REDIS: COLORS.brightMagenta,
  CACHE: COLORS.brightMagenta,
  HTTP: COLORS.brightGreen,
  GITHUB: COLORS.white,
  BACKUPS: COLORS.brightBlue,
  "MESSAGE ARCHIVE": COLORS.yellow,
  // Community
  COMMUNITY: COLORS.brightGreen,
  CHAT: COLORS.brightCyan,
  "CHAT BRIDGE": COLORS.brightCyan,
  MUSIC: COLORS.brightMagenta,
  LAVALINK: COLORS.magenta,
  VOICE: COLORS.brightCyan,
  LEVELING: COLORS.brightGreen,
  SUGGESTIONS: COLORS.brightMagenta,
  TICKETS: COLORS.green,
  "TICKET PANEL": COLORS.brightGreen,
  "TICKET ARCHIVE": COLORS.yellow,
  // Safety
  AUDIT: COLORS.brightBlue,
  SECURITY: COLORS.red,
  MODERATION: COLORS.red,
  HONEYPOT: COLORS.red,
  default: COLORS.white,
});

/** Short console names for scopes wider than the 12-character column. Colours stay keyed by the full scope. */
const SCOPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "SHARD MANAGER": "SHARDS",
  "VERSION ANNOUNCEMENTS": "RELEASE NEWS",
  "DISCORD ADAPTER": "DISCORD API",
  "DISCORD AUDIT": "AUDIT",
  "DISCORD AUDIT LOG": "AUDIT LOG",
  "BLUEPRINT PANEL": "BLUEPRINTS",
  "CORIOLIS STORM": "CORIOLIS",
  "SEASON CLAIMS": "CLAIMS",
  "MESSAGE ARCHIVE": "ARCHIVE",
  "TICKET ARCHIVE": "TRANSCRIPTS",
});
const SCOPE_WIDTH = 12;
/** Visible width of `date time  ● LEVEL SCOPE        │ `, where every message line starts. */
const MESSAGE_COLUMN = 19 + 2 + 7 + 1 + SCOPE_WIDTH + 1 + 2;
const MAX_WRAPPED_LINES = 6;

const secretKeyPattern = /(password|token|secret|cookie|authorization|session|api[-_]?key|access[-_]?token|private[-_]?key|certificate|^ca$|^cert$|^key$|tls[-_]?(ca|cert|key))/i;
const CLEAR_TERMINAL = "\u001B[2J\u001B[3J\u001B[H";
const DEFAULT_PRODUCTION_COLUMNS = 120;
const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_COLOR_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, "g");

const OPERATIONAL_ERROR_NAMES = ["DuneConsoleApiError", "DiscordAdapterApiError", "DiscordAPIError", "HTTPError"];

/** Errors whose messages come from a remote API and are safe and useful to show in production. */
function isOperationalError(error: Error): boolean {
  return OPERATIONAL_ERROR_NAMES.some((name) => error.name === name || error.name.startsWith(`${name}[`));
}

function errorCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code;
  return (typeof code === "string" || typeof code === "number") && !error.name.includes(String(code)) ? String(code) : undefined;
}

/** One readable line for an error: `Name: message`, plus its code when the name does not already carry it. Stacks are never part of it. */
function describeError(error: Error): string {
  const production = process.env.NODE_ENV === "production";
  const message = production && !isOperationalError(error) ? "Internal error" : error.message;
  const code = errorCode(error);
  return `${error.name}: ${message}${code ? ` (code ${code})` : ""}`;
}

function redact(value: unknown, key = "", seen = new WeakSet<object>(), depth = 0): unknown {
  // Dev note: Secrets enter the witness protection program here.
  if (secretKeyPattern.test(key)) return "[REDACTED]";
  if (depth > 5) return "[Truncated]";

  // Stacks are printed separately at DEBUG, so a single failure never turns into a wall of JSON.
  if (value instanceof Error) return describeError(value);

  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
  }

  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, "", seen, depth + 1));

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey, seen, depth + 1)]));
  }

  return value;
}

/** Stack frames shown at DEBUG, skipping the first line because the log line already names the error. */
function stackLines(error: Error): string[] {
  if (process.env.NODE_ENV === "production" && !isOperationalError(error)) return [];
  return (error.stack ?? "").split("\n").slice(1).map((line) => line.trim()).filter(Boolean);
}

function findError(details: unknown): Error | undefined {
  if (details instanceof Error) return details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const nested = (details as { error?: unknown }).error;
    if (nested instanceof Error) return nested;
  }
  return undefined;
}

/** Readable `key = value` fields, as the dashboard console prints them, instead of transport-shaped JSON. */
function formatDetails(details: unknown, paint: (color: string, text: string) => string): string[] {
  if (details === undefined) return [];
  if (typeof details === "string") return details.trim() ? [oneLine(details)] : [];
  const fields: string[] = [];
  const seen = new WeakSet<object>();
  function visit(value: unknown, path = "", depth = 0): void {
    if (value === undefined || fields.length >= 40) return;
    if (value && typeof value === "object") {
      if (seen.has(value) || depth > 5) return;
      seen.add(value);
      if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) {
        value.slice(0, 20).forEach((item, index) => visit(item, `${path} / ${index + 1}`, depth + 1));
        return;
      }
      if (!Array.isArray(value)) {
        for (const [key, child] of Object.entries(value).slice(0, 40)) visit(child, path ? `${path} / ${key}` : key, depth + 1);
        return;
      }
    }
    const label = oneLine(path.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase());
    const text = oneLine(Array.isArray(value) ? value.map((item) => String(item)).join(", ") : String(value ?? "—")).slice(0, 500);
    const color = value === "[REDACTED]" ? COLORS.dim : typeof value === "number" ? COLORS.brightCyan : COLORS.white;
    fields.push(`${label ? `${paint(COLORS.dim, label)} ${paint(COLORS.dim, "=")} ` : ""}${paint(color, text)}`);
  }
  visit(details);
  const rows: string[] = [];
  let row: string[] = [];
  let width = 0;
  for (const field of fields) {
    const length = visibleLength(field);
    if (row.length && (width + length > 100 || row.length >= 4)) {
      rows.push(row.join(paint(COLORS.dim, "  ·  ")));
      row = [];
      width = 0;
    }
    row.push(field);
    width += length + 5;
  }
  if (row.length) rows.push(row.join(paint(COLORS.dim, "  ·  ")));
  return rows;
}

/** Control characters become spaces, so a message can never forge lines or terminal escapes. */
function printable(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code < 160) ? " " : character;
  }).join("");
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function compactSapphireMessage(value: string): string {
  const overwrite = value.match(/^ApplicationCommandRegistries\(BulkOverwrite\) Successfully overwrote global application commands\. The application now has (\d+) global commands\.?$/u);
  if (overwrite) return `Global application commands synchronized (${overwrite[1]}).`;
  return value;
}

function visibleLength(value: string): number {
  return Array.from(value.replace(ANSI_COLOR_PATTERN, "")).length;
}

function fitConsoleLine(value: string, columns: number | undefined): string {
  if (!columns || !Number.isInteger(columns) || columns < 2) return value;
  // Leave the final cell unused: several PTYs wrap before processing the newline when every column is occupied.
  const limit = columns - 1;
  if (visibleLength(value) <= limit) return value;

  const contentLimit = Math.max(0, limit - 1);
  let output = "";
  let visible = 0;
  for (let index = 0; index < value.length && visible < contentLimit;) {
    if (value[index] === ANSI_ESCAPE) {
      const escape = ansiColorAt(value, index);
      if (escape) {
        output += escape;
        index += escape.length;
        continue;
      }
    }
    const codePoint = value.codePointAt(index)!;
    output += String.fromCodePoint(codePoint);
    index += codePoint > 0xffff ? 2 : 1;
    visible += 1;
  }
  return `${output}${value.includes(ANSI_ESCAPE) ? COLORS.reset : ""}…`;
}

function ansiColorAt(value: string, index: number): string | undefined {
  if (!value.startsWith(`${ANSI_ESCAPE}[`, index)) return undefined;
  const end = value.indexOf("m", index + 2);
  if (end === -1 || !/^[0-9;]*$/.test(value.slice(index + 2, end))) return undefined;
  return value.slice(index, end + 1);
}

function terminalColumns(level: LogLevel): number | undefined {
  const primary = level === "ERROR" || level === "FATAL" || level === "WARN" ? process.stderr.columns : process.stdout.columns;
  const fallback = process.stdout.columns ?? process.stderr.columns;
  const environment = Number(process.env.COLUMNS);
  return [primary, fallback, environment].find((value) => Number.isInteger(value) && Number(value) > 1)
    ?? (process.env.NODE_ENV === "production" || process.env.P_SERVER_UUID?.trim() ? DEFAULT_PRODUCTION_COLUMNS : undefined);
}

/**
 * Colour policy for console output. `LOG_COLOR=always|never` wins, then the NO_COLOR and
 * FORCE_COLOR conventions. In `auto` mode colour is on for a terminal and inside a Pterodactyl
 * container, whose web console renders ANSI even though the update supervisor pipes our output.
 */
function shouldUseColor(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  const mode = env.LOG_COLOR?.trim().toLowerCase() || "auto";
  if (mode === "always" || mode === "true") return true;
  if (mode === "never" || mode === "false") return false;
  if (env.NO_COLOR !== undefined || env.TERM === "dumb") return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0";
  // Dev note: The supervisor pipes our stdout, but the panel still loves a little spice in its colours.
  return isTTY || Boolean(env.P_SERVER_UUID?.trim());
}

/** Clear before the banner in a terminal or a Pterodactyl container, never for redirected output or with colours off. */
function shouldClearConsole(env: NodeJS.ProcessEnv = process.env, isTTY = Boolean(process.stdout.isTTY)): boolean {
  if (env.NO_COLOR !== undefined || ["never", "false"].includes(env.LOG_COLOR?.trim().toLowerCase() ?? "")) return false;
  return isTTY || Boolean(env.P_SERVER_UUID?.trim());
}

type Painter = (color: string, text: string) => string;

/** One console entry in the dashboard's layout: `date time  ● LEVEL SCOPE │ message · key = value`. */
function formatConsoleEntry(scope: string, level: LogLevel, message: string, details: unknown, paint: Painter, at = new Date(), columns?: number): string {
  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;
  const room = columns && Number.isInteger(columns) ? columns - 1 - MESSAGE_COLUMN : Infinity;
  const [first = "", ...rest] = wrapMessage(oneLine(printable(message)).slice(0, 500), room);
  const continuation = rest.map((chunk) => `${" ".repeat(MESSAGE_COLUMN - 2)}${paint(COLORS.dim, "│")} ${chunk}`);
  const output = [`${paint(COLORS.dim, formatTimestamp(at))}  ${paint(LEVEL_COLORS[level], `${LEVEL_ICONS[level]} ${level.padEnd(5)}`)} ${paint(scopeColor, scopeLabel(scope).padEnd(SCOPE_WIDTH))} ${paint(COLORS.dim, "│")} ${first}`, ...continuation].join("\n");
  const rows = formatDetails(redact(details), paint);
  if (rows.length === 0) return output;
  const last = rest.at(-1) ?? first;
  if (rows.length === 1 && visibleLength(rows[0]!) <= Math.min(100, room - last.length - 3)) return `${output} ${paint(COLORS.dim, "·")} ${rows[0]}`;
  return `${output}\n${rows.map((row) => `    ${paint(COLORS.dim, "↳")} ${row}`).join("\n")}`;
}

/** The scope as printed: a short label for long scopes, never wider than the column. */
function scopeLabel(scope: string): string {
  return (SCOPE_LABELS[scope] ?? scope).slice(0, SCOPE_WIDTH);
}

/**
 * Splits a long message into lines that fit beside the prefix, breaking after `|`, `·`, `,` or a space, so a
 * narrow console shows the whole line under its own scope instead of wrapping into the next column.
 */
function wrapMessage(message: string, room: number): string[] {
  if (!Number.isFinite(room) || room < 20 || message.length <= room) return [message];
  const lines: string[] = [];
  let rest = message;
  while (rest.length > room && lines.length < MAX_WRAPPED_LINES - 1) {
    const window = rest.slice(0, room + 1);
    const breakAt = Math.max(window.lastIndexOf(" | "), window.lastIndexOf(" · "));
    const cut = breakAt > room / 3 ? breakAt : Math.max(window.lastIndexOf(", ") + 1, window.lastIndexOf(" "));
    const end = cut > room / 3 ? cut : room;
    lines.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).replace(/^\s*[|·]?\s*/u, "");
  }
  lines.push(rest.length > room ? `${rest.slice(0, room - 1)}…` : rest);
  return lines;
}

interface Logger {
  header(title: string, subtitle?: string): void;
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, error?: unknown): void;
  fatal(message: string, error?: unknown): void;
}

function createLogger(scope: string, minimumLevel: string = process.env.LOG_LEVEL ?? "INFO"): Logger {
  const normalizedLevel = minimumLevel.toUpperCase() as LogLevel;

  const threshold = LEVELS[normalizedLevel] ?? LEVELS.INFO;

  const colorEnabled = shouldUseColor(process.env, Boolean(process.stdout.isTTY));
  const paint = (color: string, text: string): string => (colorEnabled ? `${color}${text}${COLORS.reset}` : text);

  function write(level: LogLevel, message: string, details?: unknown): void {
    // Dev note: Quiet logs are not shy; they simply missed the threshold.
    if (LEVELS[level] < threshold) {
      return;
    }

    const columns = terminalColumns(level);
    const output = formatConsoleEntry(scope, level, message, details, paint, new Date(), columns);
    // Dev note: The terminal may be narrow, but the log line has taken a solemn vow not to wander.
    const fittedOutput = output.split("\n").map((line) => fitConsoleLine(line, columns)).join("\n");

    if (level === "ERROR" || level === "FATAL") {
      // Dev note: Errors use stderr because even logs need healthy boundaries.
      console.error(fittedOutput);
      return;
    }

    if (level === "WARN") {
      console.warn(fittedOutput);
      return;
    }

    if (level === "DEBUG") {
      console.debug(fittedOutput);
      return;
    }

    console.info(fittedOutput);
  }

  function writeStack(details: unknown): void {
    if (LEVELS.DEBUG < threshold) return;
    const error = findError(details);
    if (!error) return;
    const columns = terminalColumns("DEBUG");
    // Dev note: The stack trace waits in the DEBUG lounge until someone actually asks for directions.
    for (const frame of stackLines(error)) console.debug(fitConsoleLine(`${paint(COLORS.dim, `    ${frame}`)}`, columns));
  }

  return Object.freeze({
    header(title: string, subtitle = "Dune: Awakening Bot"): void {
      if (LEVELS.INFO < threshold) {
        return;
      }

      // Dev note: Even an ornithopter needs a clear runway; Pterodactyl can clear ANSI without calling stdout a TTY.
      if (shouldClearConsole()) process.stdout.write(CLEAR_TERMINAL);
      const width = 64;
      const border = "─".repeat(width);
      console.log(`\n${paint(COLORS.brightOrange, `╭${border}╮`)}`);
      console.log(`${paint(COLORS.brightOrange, "│")} ${paint(COLORS.brightYellow, title.padEnd(width - 1))}${paint(COLORS.brightOrange, "│")}`);
      console.log(`${paint(COLORS.brightOrange, "│")} ${paint(COLORS.dim, subtitle.padEnd(width - 1))}${paint(COLORS.brightOrange, "│")}`);
      console.log(`${paint(COLORS.brightOrange, `╰${border}╯`)}\n`);
    },

    debug: (message: string, details?: unknown) => write("DEBUG", message, details),

    info: (message: string, details?: unknown) => write("INFO", message, details),

    warn: (message: string, details?: unknown) => {
      write("WARN", message, details);
      writeStack(details);
    },

    error: (message: string, error?: unknown) => {
      write("ERROR", message, error);
      writeStack(error);
    },

    fatal: (message: string, error?: unknown) => {
      write("FATAL", message, error);
      writeStack(error);
    },
  });
}

interface ScopedSapphireLogger extends ILogger {
  scope(scope: string): Logger;
}

function createSapphireLogger(scope: string, minimumLevel: string = process.env.LOG_LEVEL ?? "INFO"): ScopedSapphireLogger {
  const logger = createLogger(scope, minimumLevel);
  const childLoggers = new Map<string, Logger>();
  const normalizedLevel = minimumLevel.toUpperCase() as LogLevel;
  const threshold = LEVELS[normalizedLevel] ?? LEVELS.INFO;

  function resolveLevel(level: SapphireLogLevel): LogLevel | null {
    switch (level) {
      case SapphireLogLevel.Trace:
      case SapphireLogLevel.Debug:
        return "DEBUG";
      case SapphireLogLevel.Info:
        return "INFO";
      case SapphireLogLevel.Warn:
        return "WARN";
      case SapphireLogLevel.Error:
        return "ERROR";
      case SapphireLogLevel.Fatal:
        return "FATAL";
      default:
        return null;
    }
  }

  function forward(level: LogLevel, values: readonly unknown[]): void {
    const [firstValue, ...remainingValues] = values;
    let message = typeof firstValue === "string" ? firstValue : String(firstValue ?? "");
    let details: unknown;

    if (remainingValues.every((value) => typeof value === "string")) {
      message = [message, ...remainingValues].filter(Boolean).join(" ");
    } else if (remainingValues.length === 1) {
      [details] = remainingValues;
    } else if (remainingValues.length > 1) {
      details = remainingValues;
    }

    logger[level.toLowerCase() as Lowercase<LogLevel>](compactSapphireMessage(message), details);
  }

  function write(level: SapphireLogLevel, ...values: readonly unknown[]): void {
    const resolvedLevel = resolveLevel(level);

    if (resolvedLevel) {
      forward(resolvedLevel, values);
    }
  }

  function childLogger(childScope: string): Logger {
    let child = childLoggers.get(childScope);
    if (!child) {
      child = createLogger(childScope, minimumLevel);
      childLoggers.set(childScope, child);
    }
    return child;
  }

  return Object.freeze({
    has(level: SapphireLogLevel): boolean {
      const resolvedLevel = resolveLevel(level);
      return resolvedLevel !== null && LEVELS[resolvedLevel] >= threshold;
    },
    trace: (...values: readonly unknown[]) => forward("DEBUG", values),
    debug: (...values: readonly unknown[]) => forward("DEBUG", values),
    info: (...values: readonly unknown[]) => forward("INFO", values),
    warn: (...values: readonly unknown[]) => forward("WARN", values),
    error: (...values: readonly unknown[]) => forward("ERROR", values),
    fatal: (...values: readonly unknown[]) => forward("FATAL", values),
    write,
    scope: childLogger,
  });
}

function scopedLogger(source: ILogger, scope: string): Logger {
  const scoped = source as ILogger & { scope?: (childScope: string) => Logger };
  if (typeof scoped.scope === "function") return scoped.scope(scope);

  const forward = (method: "debug" | "info" | "warn" | "error" | "fatal", message: string, details?: unknown): void => {
    if (details === undefined) source[method](message);
    else source[method](message, details);
  };

  const logger: Logger = {
    header: () => undefined,
    debug: (message, details) => forward("debug", message, details),
    info: (message, details) => forward("info", message, details),
    warn: (message, details) => forward("warn", message, details),
    error: (message, details) => forward("error", message, details),
    fatal: (message, details) => forward("fatal", message, details),
  };

  return Object.freeze(logger);
}

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatTimestamp(date: Date): string {
  const values = Object.fromEntries(timestampFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

export { compactSapphireMessage, scopeLabel, wrapMessage, createLogger, describeError, createSapphireLogger, fitConsoleLine, formatConsoleEntry, scopedLogger, shouldClearConsole, shouldUseColor };

export type { Logger };
