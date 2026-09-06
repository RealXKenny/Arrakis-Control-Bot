import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";
import { createV2Response } from "../../../shared/factories/componentFactory";
import { createDuneBanner } from "../../../shared/factories/imageFactory";

const logger = createLogger("SERVER STATUS");

const IMAGE_NAME = "dune-server-status.png";
const DEFAULT_SERVER_NAME = "Dune: Awakening Community Server";

const COLORS = {
  success: 0xc58b45,
  error: 0x8f3025,
} as const;

const DUNE_COLORS = [0xc58b45, 0xd2a85a, 0xa96832, 0x8f542c, 0x70452c, 0xb87333, 0x9c6b3c] as const;

interface GameServer {
  map: string;
  state: string;
  uptime: string;
}

interface FuncomStatus {
  directorHeartbeat: string;
  populationDeclaration: string;
  maxCapacity: string;
  gatewayDb: string;
}

interface ServerStatusData {
  overall: string;
  region: string;
  population: string;
  gameServers: GameServer[];
  gameServerNote: string;
  containers: string;
  listeners: string;
  worldPartitions: number | null;
  autoscaler: string;
  autoUpdates: string;
  funcom: FuncomStatus;
}

interface ReadinessCheck {
  ok: boolean;
  label: string;
}

interface ReadinessListener {
  ok: boolean;
  protocol: string;
  port: string;
  name: string;
  status: string;
}

interface ReadinessData {
  summary: string;
  passed: number;
  failed: number;
  listenersPassed: number;
  listenersTotal: number;
  checks: ReadinessCheck[];
  listeners: ReadinessListener[];
}

interface PortData {
  ok: boolean;
  name: string;
  address: string;
  status: string;
}

interface ServiceData {
  name: string;
  status: string;
  ports?: string;
}

interface ServicesData {
  services: ServiceData[];
  containers: Array<{
    name: string;
    status: string;
  }>;
}

interface PerformanceData {
  cpuPercent?: number;
  memory?: {
    usedBytes?: number;
    totalBytes?: number;
    percent?: number;
  };
  disk?: {
    usedBytes?: number;
    totalBytes?: number;
    percent?: number;
  };
  uptime?: string;
}

interface DuneApiResponse {
  stdout?: unknown;
  cpuPercent?: unknown;
  memory?: {
    usedBytes?: unknown;
    totalBytes?: unknown;
    percent?: unknown;
  };
  disk?: {
    usedBytes?: unknown;
    totalBytes?: unknown;
    percent?: unknown;
  };
  uptime?: unknown;
}

export const data = new SlashCommandBuilder().setName("status").setDescription("Show the current Dune server status.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { client } = interaction;
  const serverName = process.env.SERVER_NAME || DEFAULT_SERVER_NAME;

  if (!client.duneApi) {
    await interaction.editReply("The Dune server integration is not configured.");
    return;
  }

  try {
    const [status, performance, readiness, ports, services] = await Promise.all([
      client.duneApi.call("GET", "/api/server/status"),
      client.duneApi.call("GET", "/api/server/performance"),
      client.duneApi.call("GET", "/api/server/readiness"),
      client.duneApi.call("GET", "/api/server/ports"),
      client.duneApi.call("GET", "/api/server/services"),
    ]);

    const statusData = parseServerStatus(toStringValue((status as DuneApiResponse).stdout));

    const readinessData = parseReadiness(toStringValue((readiness as DuneApiResponse).stdout));

    const portsData = parsePorts(toStringValue((ports as DuneApiResponse).stdout));

    const servicesData = parseServices(toStringValue((services as DuneApiResponse).stdout));

    const performanceData = parsePerformance(performance as DuneApiResponse);

    const healthy = statusData.overall === "READY" && readinessData.failed === 0;

    const accentColor = healthy ? getRandomDuneColor() : COLORS.error;

    const banner = createStatusBanner({
      serverName,
      healthy,
      overall: statusData.overall,
      population: statusData.population,
      region: statusData.region,
    });

    const statusCard = createStatusCard({
      serverName,
      healthy,
      status: statusData,
      readiness: readinessData,
      ports: portsData,
      services: servicesData,
      performance: performanceData,
      accentColor,
      requester: interaction.user.tag,
    });

    await interaction.editReply({
      ...createV2Response([statusCard], [banner]),
      allowedMentions: {
        parse: [],
      },
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    logger.error(`Unable to retrieve the Dune server status: ${errorMessage}`, error);

    await interaction.editReply({
      content: null,
      components: [createErrorCard(serverName, interaction.user.tag)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        parse: [],
      },
    });
  }
}

function createStatusCard({
  serverName,
  healthy,
  status,
  readiness,
  ports,
  services,
  performance,
  accentColor,
  requester,
}: {
  serverName: string;
  healthy: boolean;
  status: ServerStatusData;
  readiness: ReadinessData;
  ports: PortData[];
  services: ServicesData;
  performance: PerformanceData;
  accentColor: number;
  requester: string;
}): ContainerBuilder {
  const card = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${IMAGE_NAME}`)))
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Dune Server Status"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`));

  addSection(card, [
    `### ${healthy ? "🟢" : "🔴"} ${healthy ? "Server Operational" : "Server Attention Required"}`,
    `**Overall:** ${status.overall || "UNKNOWN"}`,
    `**Region:** ${status.region || "Unknown"}`,
    `**Population:** ${status.population || "Unknown"}`,
  ]);

  addSection(card, [
    "### 📊 Performance",
    `**CPU:** ${formatPercent(performance.cpuPercent)}`,
    `**Memory:** ${formatBytes(performance.memory?.usedBytes)} / ${formatBytes(performance.memory?.totalBytes)} (${formatPercent(performance.memory?.percent)})`,
    `**Disk:** ${formatBytes(performance.disk?.usedBytes)} / ${formatBytes(performance.disk?.totalBytes)} (${formatPercent(performance.disk?.percent)})`,
    `**Server Uptime:** ${performance.uptime || "Unknown"}`,
  ]);

  addSection(card, [
    "### 🎮 Game Servers",
    status.gameServers.length ? status.gameServers.map((server) => `${server.state === "READY" ? "🟢" : "🔴"} **${server.map}** — \`${server.state}\` — ${server.uptime}`).join("\n") : "No game server data reported.",
    status.gameServerNote ? `\n-# ${status.gameServerNote}` : "",
  ]);

  addSection(card, [
    "### 📦 Containers",
    services.containers.length
      ? services.containers.map((container) => `${container.status.toLowerCase().includes("healthy") ? "🟢" : "🟡"} \`${container.name}\` — ${container.status}`).join("\n")
      : status.containers || "No container data reported.",
  ]);

  addSection(card, [
    "### 🛰️ Listeners",
    `**${readiness.listenersPassed}/${readiness.listenersTotal} listeners responding**`,
    "",
    readiness.listeners.length ? readiness.listeners.map((listener) => `${listener.ok ? "🟢" : "🔴"} **${listener.name}** — \`${listener.port}\` — ${listener.status}`).join("\n") : status.listeners || "No listener data reported.",
  ]);

  addSection(card, [
    "### 🧭 Readiness",
    readiness.summary ? `**${readiness.summary}**` : "No readiness summary reported.",
    `**Checks:** ${readiness.passed} passed • ${readiness.failed} failed`,
    "",
    readiness.checks.length
      ? readiness.checks
          .slice(0, 20)
          .map((check) => `${check.ok ? "🟢" : "🔴"} ${check.label}`)
          .join("\n")
      : "No readiness checks reported.",
  ]);

  addSection(card, ["### 🔌 Service Ports", ports.length ? ports.map((port) => `${port.ok ? "🟢" : "🔴"} **${port.name}** — \`${port.address}\` — ${port.status}`).join("\n") : "No service port data reported."]);

  addSection(card, ["### ⚙️ Services", services.services.length ? services.services.map((service) => `${getServiceIndicator(service.status)} \`${service.name}\` — ${service.status}`).join("\n") : "No service data reported."]);

  addSection(card, ["### 🗄️ Database", `**World partitions:** ${status.worldPartitions ?? "Unknown"}`]);

  addSection(card, ["### 🤖 Automation", `**Autoscaler:** ${status.autoscaler || "UNKNOWN"}`, `**Auto updates:** ${status.autoUpdates || "UNKNOWN"}`]);

  addSection(card, [
    "### 🛡️ Funcom / FLS",
    `**Director heartbeat:** ${status.funcom.directorHeartbeat || "UNKNOWN"}`,
    `**Population declaration:** ${status.funcom.populationDeclaration || "UNKNOWN"}`,
    `**Max capacity declaration:** ${status.funcom.maxCapacity || "UNKNOWN"}`,
    `**Gateway DB monitoring:** ${status.funcom.gatewayDb || "UNKNOWN"}`,
  ]);

  card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent(`-# Spice flows through Arrakis • Requested by ${requester}`));

  return card;
}

function createErrorCard(serverName: string, requester: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Dune Server Status"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(["### 🔴 Server Status Unavailable", "The Arrakis server status could not be retrieved.", "Please try again later."].join("\n")))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`-# Spice flows through Arrakis • Requested by ${requester}`));
}

function addSection(card: ContainerBuilder, lines: string[]): void {
  card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent(lines.filter(Boolean).join("\n")));
}

function parseServerStatus(stdout: string): ServerStatusData {
  const result: ServerStatusData = {
    overall: "UNKNOWN",
    region: "Unknown",
    population: "Unknown",
    gameServers: [],
    gameServerNote: "",
    containers: "",
    listeners: "",
    worldPartitions: null,
    autoscaler: "UNKNOWN",
    autoUpdates: "UNKNOWN",
    funcom: {
      directorHeartbeat: "UNKNOWN",
      populationDeclaration: "UNKNOWN",
      maxCapacity: "UNKNOWN",
      gatewayDb: "UNKNOWN",
    },
  };

  result.overall = extractMatch(stdout, /Overall:\s+(.+)/, "UNKNOWN");
  result.region = extractMatch(stdout, /Region:\s+(.+)/, "Unknown");
  result.population = extractMatch(stdout, /Population:\s+(.+)/, "Unknown");

  const partitions = stdout.match(/World partitions:\s+(\d+)/);
  result.worldPartitions = partitions?.[1] ? Number(partitions[1]) : null;

  result.autoscaler = extractMatch(stdout, /Autoscaler:\s+(.+)/, "UNKNOWN");

  result.autoUpdates = extractMatch(stdout, /Auto updates:\s+(.+)/, "UNKNOWN");

  const gameSection = getSection(stdout, /=== Game servers ===([\s\S]*?)(?:\n=== Automation ===|$)/);

  for (const line of getLines(gameSection)) {
    const match = line.match(/^(\S+)\s+(READY|NOT_READY|STOPPED|UNKNOWN)\s+(.+)$/);

    if (match?.[1] && match[2] && match[3]) {
      result.gameServers.push({
        map: match[1],
        state: match[2],
        uptime: match[3],
      });
    }

    if (line.startsWith("Note:")) {
      result.gameServerNote = line.replace(/^Note:\s*/, "");
    }
  }

  const containerSection = getSection(stdout, /=== Containers ===([\s\S]*?)(?:\n=== Listeners ===|$)/);

  result.containers = getLines(containerSection)
    .filter((line) => !line.startsWith("SERVICE") && !line.includes("==="))
    .join("\n");

  const listenerSection = getSection(stdout, /=== Listeners ===([\s\S]*?)(?:\n=== Database ===|$)/);

  result.listeners = getLines(listenerSection)
    .filter((line) => !line.startsWith("CHECK") && !line.includes("==="))
    .join("\n");

  const funcomSection = getSection(stdout, /=== Funcom\/FLS summary ===([\s\S]*?)(?:\nTip:|$)/);

  result.funcom = {
    directorHeartbeat: extractMatch(funcomSection, /Director heartbeat:\s+(.+)/, "UNKNOWN"),
    populationDeclaration: extractMatch(funcomSection, /Population declaration:\s+(.+)/, "UNKNOWN"),
    maxCapacity: extractMatch(funcomSection, /Max capacity declaration:\s+(.+)/, "UNKNOWN"),
    gatewayDb: extractMatch(funcomSection, /Gateway DB monitoring:\s+(.+)/, "UNKNOWN"),
  };

  return result;
}

function parseReadiness(stdout: string): ReadinessData {
  const result: ReadinessData = {
    summary: extractMatch(stdout, /READY:\s+(.+)/, ""),
    passed: 0,
    failed: 0,
    listenersPassed: 0,
    listenersTotal: 0,
    checks: [],
    listeners: [],
  };

  for (const line of getLines(stdout)) {
    const match = line.match(/^(OK|FAIL)\s+(.+)$/);

    if (!match?.[1] || !match[2]) {
      continue;
    }

    const ok = match[1] === "OK";

    result.checks.push({
      ok,
      label: match[2],
    });

    if (ok) {
      result.passed += 1;
    } else {
      result.failed += 1;
    }
  }

  const listenerSection = getSection(stdout, /=== Listener checks ===([\s\S]*?)(?:\n=== Database world partition checks ===|$)/);

  for (const line of getLines(listenerSection)) {
    const match = line.match(/^(OK|FAIL)\s+(TCP|UDP)\s+(\d+)\s+(.+)$/);

    if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
      continue;
    }

    const ok = match[1] === "OK";
    const protocol = match[2];
    const port = match[3];

    result.listeners.push({
      ok,
      protocol,
      port: `${port}/${protocol.toLowerCase()}`,
      name: match[4],
      status: ok ? "OK" : "FAIL",
    });

    result.listenersTotal++;

    if (ok) {
      result.listenersPassed++;
    }
  }

  return result;
}

function parsePorts(stdout: string): PortData[] {
  const section = getSection(stdout, /=== Local listeners ===([\s\S]*?)(?:\n=== Generated INI values ===|$)/);

  if (!section) {
    return [];
  }

  const ports: PortData[] = [];

  for (const line of section.split("\n")) {
    const match = line.trim().match(/^(\w+)\s+(.+?)\s+(TCP|UDP)\s+(\d+)(?:\s+at\s+(.+))?$/);

    if (!match?.[2] || !match[3] || !match[4]) {
      continue;
    }

    ports.push({
      ok: true,
      name: match[2],
      address: `${match[5] || "localhost"}:${match[4]}/${match[3].toLowerCase()}`,
      status: "OK",
    });
  }

  if (ports.length) {
    return ports;
  }

  for (const line of getLines(section).filter((line) => line.startsWith("OK"))) {
    const match = line.match(/^OK\s+(.+?)\s+listening on (TCP|UDP)\s+(\d+)(?:\s+at\s+(.+))?$/);

    if (!match?.[1] || !match[2] || !match[3]) {
      continue;
    }

    ports.push({
      ok: true,
      name: match[1],
      address: `${match[4] || "localhost"}:${match[3]}/${match[2].toLowerCase()}`,
      status: "OK",
    });
  }

  return ports;
}

function parseServices(stdout: string): ServicesData {
  const result: ServicesData = {
    services: [],
    containers: [],
  };

  const lines = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const startIndex = lines.findIndex((line) => line.startsWith("NAMES"));

  if (startIndex === -1) {
    return result;
  }

  for (const line of lines.slice(startIndex + 1)) {
    const match = line.match(/^(\S+)\s{2,}(.+?)(?:\s{2,}(.*))?$/);

    if (!match?.[1] || !match[2]) {
      continue;
    }

    const name = match[1];
    const status = match[2].trim();

    result.services.push({
      name,
      status,
      ports: match[3]?.trim() || "",
    });

    result.containers.push({
      name,
      status,
    });
  }

  return result;
}

function parsePerformance(response: DuneApiResponse): PerformanceData {
  return {
    cpuPercent: toNumber(response.cpuPercent),
    memory: {
      usedBytes: toNumber(response.memory?.usedBytes),
      totalBytes: toNumber(response.memory?.totalBytes),
      percent: toNumber(response.memory?.percent),
    },
    disk: {
      usedBytes: toNumber(response.disk?.usedBytes),
      totalBytes: toNumber(response.disk?.totalBytes),
      percent: toNumber(response.disk?.percent),
    },
    uptime: toStringValue(response.uptime),
  };
}

function getServiceIndicator(status: string): string {
  const value = status.toLowerCase();

  if (value.includes("healthy") || value.startsWith("up")) {
    return "🟢";
  }

  if (value.includes("starting")) {
    return "🟡";
  }

  if (value.includes("restarting")) {
    return "🟠";
  }

  if (value.includes("exited") || value.includes("dead")) {
    return "🔴";
  }

  return "🟡";
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  return `${value.toFixed(1)}%`;
}

function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    return "Unknown";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];

  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }

  return `${value.toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
}

function createStatusBanner({ serverName, healthy, overall, population, region }: { serverName: string; healthy: boolean; overall: string; population: string; region: string }) {
  return createDuneBanner({
    filename: IMAGE_NAME,
    title: healthy ? "Server Ready" : "Server Alert",
    subtitle: `${overall || "UNKNOWN"} • ${population || "0/0"}`,
    detail: `${serverName} • ${region || "ARRAKIS"}`,
  });
}

function getRandomDuneColor(): number {
  return DUNE_COLORS[Math.floor(Math.random() * DUNE_COLORS.length)];
}

function getSection(stdout: string, regex: RegExp): string {
  return stdout.match(regex)?.[1]?.trim() ?? "";
}

function getLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractMatch(value: string, regex: RegExp, fallback: string): string {
  return value.match(regex)?.[1]?.trim() || fallback;
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export default {
  data,
  execute,
};
