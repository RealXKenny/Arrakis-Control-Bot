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
  DASHBOARD: COLORS.brightOrange,
  default: COLORS.white,
});

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

  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;

  function write(level: LogLevel, message: string, details?: unknown): void {
    if (LEVELS[level] < threshold) {
      return;
    }

    const timestamp = formatTimestamp(new Date());

    const output = `${COLORS.dim}[${timestamp}]${COLORS.reset} ` + `${LEVEL_COLORS[level]}[${level}]${COLORS.reset} ` + `${scopeColor}[${scope}]${COLORS.reset} ` + message;

    if (level === "ERROR" || level === "FATAL") {
      if (details === undefined) {
        console.error(output);
      } else {
        console.error(output, details instanceof Error ? details.message : details);
      }

      return;
    }

    if (level === "WARN") {
      if (details === undefined) {
        console.warn(output);
      } else {
        console.warn(output, details);
      }

      return;
    }

    if (details === undefined) {
      console.log(output);
    } else {
      console.log(output, details);
    }
  }

  return Object.freeze({
    header(title: string, subtitle = "Discord control bot"): void {
      if (LEVELS.INFO < threshold) {
        return;
      }

      const banner = [
        "  ██████╗██████╗ ██╗███╗   ███╗███████╗ ██████╗ ███╗   ██╗    ███████╗██╗  ██╗██╗███████╗███████╗ ",
        " ██╔════╝██╔══██╗██║████╗ ████║██╔════╝██╔═══██╗████╗  ██║    ██╔════╝██║ ██╔╝██║██╔════╝██╔════╝ ",
        " ██║     ██████╔╝██║██╔████╔██║███████╗██║   ██║██╔██╗ ██║    ███████╗█████╔╝ ██║█████╗  ███████╗ ",
        " ██║     ██╔══██╗██║██║╚██╔╝██║╚════██║██║   ██║██║╚██╗██║    ╚════██║██╔═██╗ ██║██╔══╝  ╚════██║ ",
        " ╚██████╗██║  ██║██║██║ ╚═╝ ██║███████║╚██████╔╝██║ ╚████║    ███████║██║  ██╗██║███████╗███████║ ",
        "  ╚═════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝    ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝ ",
      ].join("\n");

      console.log(`\n${COLORS.yellow}${banner}${COLORS.reset}`);

      console.log(`${COLORS.cyan}${title}${COLORS.reset} ` + `${COLORS.dim}- ${subtitle}${COLORS.reset}\n`);
    },

    debug: (message: string, details?: unknown) => write("DEBUG", message, details),

    info: (message: string, details?: unknown) => write("INFO", message, details),

    warn: (message: string, details?: unknown) => write("WARN", message, details),

    error: (message: string, error?: unknown) => write("ERROR", message, error),

    fatal: (message: string, error?: unknown) => write("FATAL", message, error),
  });
}

function formatTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.month}/${values.day}/${values.year} ` + `${values.hour}:${values.minute}:${values.second} ` + `${values.dayPeriod}`;
}

export { createLogger, formatTimestamp };

export type { LogLevel, Logger };
