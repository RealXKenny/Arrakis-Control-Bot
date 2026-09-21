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

const SCOPE_COLORS: Record<string, string> = Object.freeze({
  BOT: COLORS.brightYellow,
  DISCORD: COLORS.brightCyan,
  "SHARD MANAGER": COLORS.brightMagenta,
  "PLAYER PANEL": COLORS.brightGreen,
  "BLUEPRINT PANEL": COLORS.yellow,
  COMMANDS: COLORS.brightBlue,
  COMPONENTS: COLORS.magenta,
  EVENTS: COLORS.green,
  INTERACTIONS: COLORS.cyan,
  "DUNE API": COLORS.yellow,
  "DISCORD ADAPTER": COLORS.brightCyan,
  "DISCORD AUDIT": COLORS.brightGreen,
  "DISCORD AUDIT LOG": COLORS.brightMagenta,
  SYSTEM: COLORS.brightYellow,
  CONFIG: COLORS.brightBlue,
  STORAGE: COLORS.brightGreen,
  SAPPHIRE: COLORS.magenta,
  GATEWAY: COLORS.brightCyan,
  COMMUNITY: COLORS.brightGreen,
  "CHAT BRIDGE": COLORS.yellow,
  MUSIC: COLORS.brightMagenta,
  LAVALINK: COLORS.magenta,
  VOICE: COLORS.brightCyan,
  PLAYERS: COLORS.brightGreen,
  MARKET: COLORS.brightOrange,
  MODERATION: COLORS.red,
  SERVER: COLORS.yellow,
  BACKUPS: COLORS.brightBlue,
  UPDATES: COLORS.brightYellow,
  RELEASES: COLORS.brightOrange,
  "CONVOY API": COLORS.brightBlue,
  "VERSION ANNOUNCEMENTS": COLORS.brightOrange,
  "TICKET ARCHIVE": COLORS.yellow,
  "TICKET PANEL": COLORS.brightGreen,
  TICKETS: COLORS.green,
  "CORIOLIS STORM": COLORS.brightOrange,
  DASHBOARD: COLORS.brightOrange,
  default: COLORS.white,
});

type LogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  [key: string]: unknown;
};

const secretKeyPattern = /(password|token|secret|cookie|authorization|session|api[-_]?key|access[-_]?token)/i;
const CLEAR_TERMINAL = "\u001B[2J\u001B[3J\u001B[H";
const DEFAULT_PRODUCTION_COLUMNS = 120;
const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_COLOR_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, "g");

function redact(value: unknown, key = ""): unknown {
  // Dev note: Secrets enter the witness protection program here.
  if (secretKeyPattern.test(key)) return "[REDACTED]";

  if (value instanceof Error) {
    const operationalError = ["DuneConsoleApiError", "DiscordAdapterApiError"].includes(value.name);
    const production = process.env.NODE_ENV === "production";

    return {
      name: value.name,
      message: production && !operationalError ? "Internal error" : value.message,
      stack: production || operationalError ? undefined : value.stack,
    };
  }

  if (Array.isArray(value)) return value.map((item) => redact(item));

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }

  return value;
}

function formatDetails(details: unknown): string {
  if (details === undefined) return "";
  if (typeof details === "string") return details;

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
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
    ?? (process.env.NODE_ENV === "production" ? DEFAULT_PRODUCTION_COLUMNS : undefined);
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

  const colorEnabled = process.env.NO_COLOR === undefined && process.env.TERM !== "dumb" && (process.env.FORCE_COLOR !== undefined ? process.env.FORCE_COLOR !== "0" : Boolean(process.stdout.isTTY));
  const paint = (color: string, text: string): string => (colorEnabled ? `${color}${text}${COLORS.reset}` : text);
  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;

  function write(level: LogLevel, message: string, details?: unknown): void {
    // Dev note: Quiet logs are not shy; they simply missed the threshold.
    if (LEVELS[level] < threshold) {
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const output = `${paint(COLORS.dim, `[${timestamp}]`)} ${paint(LEVEL_COLORS[level], `${LEVEL_ICONS[level]} [${level}]`)} ${paint(scopeColor, `[${scope}]`)} ${oneLine(message)}`;
    const line = oneLine(formatDetails(redact(details)));
    const formattedOutput = line ? `${output} ${paint(COLORS.dim, "·")} ${line}` : output;
    // Dev note: The terminal may be narrow, but the log line has taken a solemn vow not to wander.
    const fittedOutput = fitConsoleLine(formattedOutput, terminalColumns(level));

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

  return Object.freeze({
    header(title: string, subtitle = "Dune: Awakening Bot"): void {
      if (LEVELS.INFO < threshold) {
        return;
      }

      // Dev note: Even an ornithopter needs a clear runway; Pterodactyl can clear ANSI without calling stdout a TTY.
      process.stdout.write(CLEAR_TERMINAL);
      const width = 64;
      const border = "─".repeat(width);
      console.log(`\n${paint(COLORS.brightOrange, `╭${border}╮`)}`);
      console.log(`${paint(COLORS.brightOrange, "│")} ${paint(COLORS.brightYellow, title.padEnd(width - 1))}${paint(COLORS.brightOrange, "│")}`);
      console.log(`${paint(COLORS.brightOrange, "│")} ${paint(COLORS.dim, subtitle.padEnd(width - 1))}${paint(COLORS.brightOrange, "│")}`);
      console.log(`${paint(COLORS.brightOrange, `╰${border}╯`)}\n`);
    },

    debug: (message: string, details?: unknown) => write("DEBUG", message, details),

    info: (message: string, details?: unknown) => write("INFO", message, details),

    warn: (message: string, details?: unknown) => write("WARN", message, details),

    error: (message: string, error?: unknown) => write("ERROR", message, error),

    fatal: (message: string, error?: unknown) => write("FATAL", message, error),
  });
}

interface ScopedSapphireLogger extends ILogger {
  scope(scope: string): Logger;
}

function createRequestLogger(context: LogContext, scope = "REQUEST"): Logger {
  const requestLogger = createLogger(scope);
  const mergeDetails = (details: unknown): LogContext => (details && typeof details === "object" && !Array.isArray(details) ? { ...context, ...(details as LogContext) } : { ...context, details });

  const logger: Logger = {
    header: requestLogger.header,
    debug: (message, details) => requestLogger.debug(message, mergeDetails(details)),
    info: (message, details) => requestLogger.info(message, mergeDetails(details)),
    warn: (message, details) => requestLogger.warn(message, mergeDetails(details)),
    error: (message, error) => requestLogger.error(message, { ...context, error }),
    fatal: (message, error) => requestLogger.fatal(message, { ...context, error }),
  };

  return Object.freeze(logger);
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
  hour12: true,
});

function formatTimestamp(date: Date): string {
  const parts = timestampFormatter.formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.month}/${values.day}/${values.year} ` + `${values.hour}:${values.minute}:${values.second} ` + `${values.dayPeriod}`;
}

export { compactSapphireMessage, createLogger, createRequestLogger, createSapphireLogger, fitConsoleLine, formatTimestamp, scopedLogger };

export type { LogContext, LogLevel, Logger, ScopedSapphireLogger };
