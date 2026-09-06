interface CommandResponse {
  stdout?: string | null;
  exitCode?: number | null;
}

interface KeyValueBlock {
  [key: string]: string;
}

type TableRow = string[];

interface PerformanceMemory {
  usedBytes?: unknown;
  totalBytes?: unknown;
  percent?: unknown;
}

interface PerformanceDisk {
  usedBytes?: unknown;
  totalBytes?: unknown;
  freeBytes?: unknown;
  percent?: unknown;
}

interface PerformanceResponse extends CommandResponse {
  cpuPercent?: unknown;
  memory?: PerformanceMemory | null;
  disk?: PerformanceDisk | null;
  uptime?: string | null;
  sampledAt?: string | number | Date | null;
}

interface ServerStatusResult {
  healthy: boolean;
  overview: string;
  gameServers: string;
  containers: string;
  listeners: string;
  automation: string;
  performance: string;
  readiness: string;
  ports: string;
  services: string;
}

function formatServerStatus(
  status: CommandResponse | null | undefined,
  performance: PerformanceResponse | null = null,
  readiness: CommandResponse | null = null,
  ports: CommandResponse | null = null,
  services: CommandResponse | null = null,
): ServerStatusResult {
  const output = status?.stdout ?? "";

  const overview = parseKeyValueBlock(getSection(output, "Dune status"));

  const containers = parseTable(getSection(output, "Containers"));

  const listeners = parseTable(getSection(output, "Listeners"));

  const gameServers = parseTable(getSection(output, "Game servers"));

  const automation = parseKeyValueBlock(getSection(output, "Automation"));

  return {
    healthy: overview.Overall?.toUpperCase() === "READY" && status?.exitCode === 0,

    overview: [
      field("Overall", overview.Overall),
      field("Title", overview.Title),
      field("Region", overview.Region),
      field("Mode", overview.Mode),
      field("Population", overview.Population),
      field("Server IP", overview["Server IP"]),
      field("Battlegroup", overview.Battlegroup),
    ]
      .filter((value): value is string => value !== null)
      .join("\n"),

    gameServers: formatTable(gameServers, ["MAP", "STATE", "UPTIME"]),

    containers: formatTable(containers, ["SERVICE", "STATUS"]),

    listeners: formatListenerSummary(listeners),

    automation: [field("Autoscaler", automation.Autoscaler), field("Auto updates", automation["Auto updates"])].filter((value): value is string => value !== null).join("\n"),

    performance: formatPerformance(performance),

    readiness: formatReadiness(readiness),

    ports: formatPorts(ports),

    services: formatServices(services),
  };
}

function getSection(output: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const match = output.match(new RegExp(`=== ${escapedHeading} ===\\s*([\\s\\S]*?)(?=\\n=== |$)`, "i"));

  return match?.[1]?.trim() ?? "";
}

function parseKeyValueBlock(section: string): KeyValueBlock {
  if (!section) {
    return {};
  }

  const result: KeyValueBlock = {};

  for (const line of section.split("\n")) {
    const match = line.match(/^(.+?):\s+(.+)$/);

    if (!match) {
      continue;
    }

    const [, key, value] = match;

    result[key.trim()] = value.trim();
  }

  return result;
}

function parseTable(section: string): TableRow[] {
  const lines = section
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const columnStarts = [...lines[0].matchAll(/\S+/g)].map((match) => match.index).filter((index): index is number => index !== undefined);

  return lines
    .slice(1)
    .map((line) => columnStarts.map((start, index) => line.slice(start, columnStarts[index + 1]).trim()))
    .filter((columns) => columns.length >= 2);
}

function formatTable(rows: TableRow[], headers: string[]): string {
  if (!rows.length) {
    return "No data reported.";
  }

  return ["```", headers.join("  "), ...rows.map((row) => row.join("  ")), "```"].join("\n");
}

function formatListenerSummary(listeners: TableRow[]): string {
  if (!listeners.length) {
    return "No listener data reported.";
  }

  const healthy = listeners.filter(([, , state]) => state?.toUpperCase() === "OK").length;

  return [`**${healthy}/${listeners.length} listeners responding**`, formatTable(listeners, ["CHECK", "PORT", "STATUS"])].join("\n");
}

function formatPerformance(response: PerformanceResponse | null): string {
  if (!response || typeof response !== "object") {
    return "No performance data reported.";
  }

  const cpu = Number(response.cpuPercent);
  const memory = response.memory;
  const disk = response.disk;

  const lines: string[] = [];

  if (Number.isFinite(cpu)) {
    lines.push(`**CPU:** ${cpu.toFixed(1)}%`);
  }

  if (memory) {
    lines.push(`**Memory:** ${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)} (${formatPercent(memory.percent)})`);
  }

  if (disk) {
    lines.push(`**Disk:** ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)} (${formatPercent(disk.percent)})`);

    if (disk.freeBytes !== undefined) {
      lines.push(`**Disk Free:** ${formatBytes(disk.freeBytes)}`);
    }
  }

  if (response.uptime) {
    lines.push(`**Uptime:** ${response.uptime}`);
  }

  if (response.sampledAt) {
    const timestamp = new Date(response.sampledAt);

    if (!Number.isNaN(timestamp.getTime())) {
      lines.push(`**Sampled:** <t:${Math.floor(timestamp.getTime() / 1000)}:R>`);
    }
  }

  return lines.length ? lines.join("\n") : "No performance data reported.";
}

function formatReadiness(response: CommandResponse | null): string {
  if (!response) {
    return "No readiness data reported.";
  }

  const output = response.stdout ?? "";

  if (!output) {
    return "No readiness data reported.";
  }

  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("==="))
    .filter((line) => !line.startsWith("Note:"));

  const checks = lines.filter((line) => /^(OK|FAIL|WARN)\s+/i.test(line));

  const ok = checks.filter((line) => /^OK\s+/i.test(line)).length;

  const failed = checks.filter((line) => /^FAIL\s+/i.test(line)).length;

  const warnings = checks.filter((line) => /^WARN\s+/i.test(line)).length;

  const ready = /READY:/i.test(output);

  const summary: string[] = [`**Status:** ${ready ? "🟢 READY" : "🔴 NOT READY"}`, `**Checks:** ${ok} OK${warnings ? ` • ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}${failed ? ` • ${failed} failed` : ""}`];

  return summary.join("\n");
}

function formatPorts(response: CommandResponse | null): string {
  if (!response) {
    return "No service port data reported.";
  }

  const output = response.stdout ?? "";

  if (!output) {
    return "No service port data reported.";
  }

  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const endpointLines = lines.filter((line) => /^(Overmap game|Survival_1 game|Survival_1 IGW|Overmap IGW|RabbitMQ game|RabbitMQ game HTTP)\s+/i.test(line));

  if (!endpointLines.length) {
    return "No service port data reported.";
  }

  return endpointLines
    .map((line) => {
      const parts = line.split(/\s{2,}/);

      if (parts.length >= 2) {
        return `**${parts[0]}** — \`${parts.slice(1).join(" ")}\``;
      }

      return `\`${line}\``;
    })
    .join("\n");
}

function formatServices(response: CommandResponse | null): string {
  if (!response) {
    return "No service data reported.";
  }

  const output = response.stdout ?? "";

  if (!output) {
    return "No service data reported.";
  }

  const lines = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const serviceLines = lines.filter((line) => !line.startsWith("NAMES") && /^(redblink-|dune-)\S+\s+/.test(line));

  if (!serviceLines.length) {
    return "No service data reported.";
  }

  return serviceLines
    .map((line) => {
      const match = line.match(/^(\S+)\s+(.+?)(?:\s{2,}(.*))?$/);

      if (!match) {
        return `• \`${line.trim()}\``;
      }

      const [, name, status, ports] = match;

      const normalizedStatus = status.trim();

      const healthy = /^Up\b/i.test(normalizedStatus);

      const statusIcon = healthy ? "🟢" : "🔴";

      return [`${statusIcon} **${name}**`, `└ ${normalizedStatus}${ports ? ` • \`${ports.trim()}\`` : ""}`].join("\n");
    })
    .join("\n");
}

function field(label: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return `**${label}:** ${escapeMarkdown(String(value))}`;
}

function formatPercent(value: unknown): string {
  const number = Number(value);

  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "Unknown";
}

function formatBytes(bytes: unknown): string {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value < 0) {
    return "Unknown";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 ** 3) {
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  if (value < 1024 ** 4) {
    return `${(value / 1024 ** 3).toFixed(1)} GB`;
  }

  return `${(value / 1024 ** 4).toFixed(1)} TB`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

export { formatServerStatus };

export type { CommandResponse, PerformanceResponse, ServerStatusResult };
