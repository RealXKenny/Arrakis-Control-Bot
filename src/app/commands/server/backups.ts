import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";
import { createV2Response } from "../../../shared/factories/componentFactory";
import { createDuneBanner } from "../../../shared/factories/imageFactory";
import { truncateDiscordText } from "../../../shared/utils/discordLimits";

const logger = createLogger("BACKUPS");

const DEFAULT_SERVER_NAME = "Dune: Awakening Community Server";
const IMAGE_NAME = "dune-server-backups.png";
const UNAVAILABLE = "Unknown";

const COLORS = {
  accent: 0xc58b45,
  error: 0x8f3025,
} as const;

const DUNE_COLORS = [0xc58b45, 0xd2a85a, 0xa96832, 0x8f542c, 0x70452c, 0xb87333, 0x9c6b3c] as const;

type ApiObject = Record<string, unknown>;
type TimestampValue = string | number | Date | null | undefined;

interface BackupDisplay {
  count: number;
  content: string;
}

interface AutoBackupDisplay {
  enabled: boolean;
  backupTime: string | null;
  intervalHours: number | null;
  retentionDays: number | null;
  directory: string | null;
  timerStatus: string | null;
  timerUnit: string | null;
  serviceUnit: string | null;
  nextBackup: string;
  lastBackup: string;
}

interface ParsedBackup {
  timestamp: string;
  path: string;
}

const getServerName = (): string => process.env.SERVER_NAME?.trim() || DEFAULT_SERVER_NAME;

const isObject = (value: unknown): value is ApiObject => typeof value === "object" && value !== null;

const asObject = (value: unknown): ApiObject | null => (isObject(value) ? value : null);

const asArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

const getFirstDefined = (object: ApiObject, keys: string[]): unknown => {
  for (const key of keys) {
    const value = object[key];

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
};

const getRandomAccentColor = (): number => DUNE_COLORS[Math.floor(Math.random() * DUNE_COLORS.length)]!;

const createBackupCard = (serverName: string, backups: BackupDisplay, autoBackup: AutoBackupDisplay, requestedBy: string): ContainerBuilder => {
  return new ContainerBuilder()
    .setAccentColor(getRandomAccentColor())
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${IMAGE_NAME}`)))
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Dune Server Backups"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${truncateDiscordText(serverName, 150, "…")}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(["### 📦 Database Backups", backups.content].join("\n"), 1_700)))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(truncateDiscordText([`### ${autoBackup.enabled ? "🟢" : "🔴"} Auto-Backups`, `**Status:** ${autoBackup.enabled ? "🟢 ENABLED" : "🔴 DISABLED"}`, `**Directory:** \`${autoBackup.directory || UNAVAILABLE}\``].join("\n"), 450)),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(truncateDiscordText(
        [
          "### 🕒 Schedule",
          `**Backup time:** \`${autoBackup.backupTime || UNAVAILABLE} UTC\``,
          `**Interval:** \`${autoBackup.intervalHours ?? UNAVAILABLE} hours\``,
          `**Retention:** \`${autoBackup.retentionDays ?? UNAVAILABLE} days\``,
          `**Next backup:** ${autoBackup.nextBackup}`,
          `**Last backup:** ${autoBackup.lastBackup}`,
        ].join("\n"), 650)),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(truncateDiscordText(["### ⚙️ Systemd Timer", `**Status:** \`${autoBackup.timerStatus || UNAVAILABLE}\``, `**Unit:** \`${autoBackup.timerUnit || UNAVAILABLE}\``, `**Activates:** \`${autoBackup.serviceUnit || UNAVAILABLE}\``].join("\n"), 450)),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(`-# ${backups.count} backup${backups.count === 1 ? "" : "s"} available • Spice flows through Arrakis • Requested by ${requestedBy}`, 200, "…")));
};

const createErrorCard = (
  serverName: string,
  requestedBy: string,
  error: {
    message: string;
    status: number | string | null;
  },
): ContainerBuilder => {
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Dune Server Backups"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${truncateDiscordText(serverName, 150, "…")}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(truncateDiscordText(["### 🔴 Backups Unavailable", "The server backup information could not be retrieved.", "", `**Error:** \`${error.message}\``, error.status !== null ? `**HTTP Status:** \`${error.status}\`` : null].filter(Boolean).join("\n"), 1_000)),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(`-# Spice flows through Arrakis • Requested by ${requestedBy}`, 180, "…")));
};

module.exports = {
  data: new SlashCommandBuilder().setName("backups").setDescription("Show available Dune server backups and auto-backup status."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const serverName = getServerName();

    try {
      const { duneApi } = interaction.client;

      const [backupResponse, autoBackupResponse] = await Promise.all([duneApi.call("GET", "/api/backups"), duneApi.call("GET", "/api/backups/auto")]);

      const backups = parseBackups(backupResponse);
      const autoBackup = parseAutoBackup(autoBackupResponse);

      const banner = createBackupBanner({
        serverName,
        count: backups.count,
      });

      const card = createBackupCard(serverName, backups, autoBackup, interaction.user.tag);

      await interaction.editReply({
        ...createV2Response([card], [banner]),
        allowedMentions: {
          parse: [],
        },
      });
    } catch (error: unknown) {
      const details = getErrorDetails(error);

      await interaction.editReply({
        ...createV2Response([createErrorCard(serverName, interaction.user.tag, details)]),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: {
          parse: [],
        },
      });

      logger.error(`Unable to retrieve Dune server backup information. ${details.message}`, error);
    }
  },
};

function parseBackups(response: unknown): BackupDisplay {
  const arrayResponse = asArray(response);

  if (arrayResponse) {
    return formatBackupList(arrayResponse);
  }

  const objectResponse = asObject(response);

  if (!objectResponse) {
    return emptyBackupDisplay();
  }

  for (const key of ["backups", "data"]) {
    const backups = asArray(objectResponse[key]);

    if (backups) {
      return formatBackupList(backups);
    }
  }

  if (typeof objectResponse.stdout === "string") {
    return parseBackupOutput(objectResponse.stdout);
  }

  const entries = Object.entries(objectResponse).filter(([, value]) => value !== null && value !== undefined);

  if (!entries.length) {
    return emptyBackupDisplay();
  }

  return {
    count: entries.length,
    content: entries.map(([key, value]) => `**${formatLabel(key)}:** ${formatValue(value)}`).join("\n"),
  };
}

function emptyBackupDisplay(): BackupDisplay {
  return {
    count: 0,
    content: "No backups available.",
  };
}

function parseBackupOutput(stdout: string): BackupDisplay {
  const backups: ParsedBackup[] = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("==="))
    .flatMap((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+)$/);

      if (!match) {
        return [];
      }

      return [
        {
          timestamp: `${match[1]}T${match[2]}Z`,
          path: match[3].trim(),
        },
      ];
    });

  return formatBackupList(backups);
}

function formatBackupList(backups: unknown[]): BackupDisplay {
  if (!backups.length) {
    return emptyBackupDisplay();
  }

  const sorted = [...backups].sort((a, b) => getTimestampFromUnknown(b) - getTimestampFromUnknown(a));

  return {
    count: sorted.length,
    content: sorted.map((backup, index) => formatBackup(backup, index)).join("\n\n"),
  };
}

function formatBackup(backup: unknown, index: number): string {
  if (typeof backup === "string" || typeof backup === "number") {
    return `**${index + 1}.** 💾 \`${backup}\``;
  }

  const object = asObject(backup);

  if (!object) {
    return `**${index + 1}.** 💾 \`${String(backup)}\``;
  }

  const path = getFirstDefined(object, ["path", "name", "filename", "fileName", "id"]) ?? `Backup ${index + 1}`;

  const timestamp = getFirstDefined(object, ["timestamp", "createdAt", "created_at", "date"]);

  const size = getFirstDefined(object, ["size", "sizeBytes", "bytes"]);

  const status = getFirstDefined(object, ["status", "state"]);

  const details = [discordTimestampUnknown(timestamp), size !== undefined && size !== null ? formatBytes(size) : null, typeof status === "string" && status ? status.toUpperCase() : null].filter(Boolean);

  return [`**${index + 1}.** 💾 \`${getFilename(path)}\``, details.length ? `└ ${details.join(" • ")}` : null].filter(Boolean).join("\n");
}

function parseAutoBackup(response: unknown): AutoBackupDisplay {
  if (!response) {
    return emptyAutoBackup();
  }

  if (typeof response === "string") {
    return parseAutoBackupOutput(response);
  }

  const object = asObject(response);

  if (!object) {
    return emptyAutoBackup();
  }

  if (typeof object.stdout === "string") {
    return parseAutoBackupOutput(object.stdout);
  }

  return parseAutoBackupObject(object);
}

function parseAutoBackupOutput(stdout: string): AutoBackupDisplay {
  const text = stdout.replace(/\r/g, "");

  const enabled = extractBoolean(text, /Enabled:\s*(true|false)/i);

  const backupTime = extractValue(text, /Backup time:\s*([^\s]+)/i) ?? extractValue(text, /backup[_\s-]?time:\s*([^\s]+)/i);

  const intervalMatch = text.match(/Interval hours:\s*(\d+(?:\.\d+)?)/i);

  const retentionMatch = text.match(/Retention:\s*(\d+)\s*days?/i);

  const directory = extractValue(text, /Backup directory:\s*(.+?)(?=\s+Systemd timer:|\n|$)/i);

  const timerStatus = extractValue(text, /Systemd timer:\s*([^\s]+)/i) ?? detectTimerStatus(text);

  const timer = parseSystemdTimer(extractTimerSection(text));

  const lastBackup = findLastBackup(text);

  const intervalHours = intervalMatch ? Number(intervalMatch[1]) : null;

  const nextBackup =
    timer.nextBackup ??
    calculateNextBackup({
      backupTime,
      intervalHours,
      lastBackupTimestamp: lastBackup?.timestamp ?? null,
    });

  return {
    enabled,
    backupTime,
    intervalHours,
    retentionDays: retentionMatch ? Number(retentionMatch[1]) : null,
    directory,
    timerStatus,
    timerUnit: timer.timerUnit,
    serviceUnit: timer.serviceUnit,
    nextBackup: nextBackup ? (discordTimestampUnknown(nextBackup) ?? UNAVAILABLE) : UNAVAILABLE,
    lastBackup: lastBackup ? formatLastBackup(lastBackup.timestamp) : UNAVAILABLE,
  };
}

function parseAutoBackupObject(response: ApiObject): AutoBackupDisplay {
  const enabled = getBoolean(getFirstDefined(response, ["enabled", "active", "running", "autoBackup", "auto_backup"]));

  const backupTime = toStringOrNull(getFirstDefined(response, ["backupTime", "backup_time", "time"]));

  const intervalHours = toNumberOrNull(getFirstDefined(response, ["intervalHours", "interval_hours", "interval"]));

  const retentionDays = toNumberOrNull(getFirstDefined(response, ["retentionDays", "retention_days", "retention"]));

  const directory = toStringOrNull(getFirstDefined(response, ["directory", "backupDirectory", "backup_directory"]));

  const timer = asObject(response.timer) ?? {};

  const nextRaw = getFirstDefined(response, ["nextBackup", "next_backup", "next"]) ?? getFirstDefined(timer, ["next", "nextBackup"]);

  const lastRaw = getFirstDefined(response, ["lastBackup", "last_backup", "last"]);

  const calculatedNext =
    nextRaw ??
    calculateNextBackup({
      backupTime,
      intervalHours,
      lastBackupTimestamp: getTimestampFromUnknown(lastRaw),
    });

  return {
    enabled,
    backupTime,
    intervalHours,
    retentionDays,
    directory,
    timerStatus: toStringOrNull(getFirstDefined(response, ["timerStatus", "timer_status"])) ?? toStringOrNull(timer.status),
    timerUnit: toStringOrNull(getFirstDefined(response, ["timerUnit", "timer_unit"])) ?? toStringOrNull(timer.unit),
    serviceUnit: toStringOrNull(getFirstDefined(response, ["serviceUnit", "service_unit"])) ?? toStringOrNull(timer.service),
    nextBackup: calculatedNext ? (discordTimestampUnknown(calculatedNext) ?? UNAVAILABLE) : UNAVAILABLE,
    lastBackup: lastRaw ? formatLastBackupUnknown(lastRaw) : UNAVAILABLE,
  };
}

function parseSystemdTimer(text: string): {
  nextBackup: string | null;
  timerUnit: string | null;
  serviceUnit: string | null;
} {
  if (!text) {
    return {
      nextBackup: null,
      timerUnit: null,
      serviceUnit: null,
    };
  }

  const timerLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^(Sat|Sun|Mon|Tue|Wed|Thu|Fri)\s/i.test(line));

  let nextBackup: string | null = null;
  let timerUnit: string | null = null;
  let serviceUnit: string | null = null;

  if (timerLine) {
    const match = timerLine.match(/^(?:Sat|Sun|Mon|Tue|Wed|Thu|Fri)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC\s+.*?\s+(dune-[^\s]+\.timer)\s+(dune-[^\s]+\.service)/i);

    if (match) {
      nextBackup = `${match[1]}T${match[2]}Z`;
      timerUnit = match[3];
      serviceUnit = match[4];
    }
  }

  timerUnit ??= text.match(/(dune-[a-z0-9-]+\.timer)/i)?.[1] ?? null;

  serviceUnit ??= text.match(/(dune-[a-z0-9-]+\.service)/i)?.[1] ?? null;

  return {
    nextBackup,
    timerUnit,
    serviceUnit,
  };
}

function extractTimerSection(text: string): string {
  const index = text.search(/NEXT\s+LEFT\s+LAST\s+PASSED/i);

  return index === -1 ? "" : text.slice(index);
}

function findLastBackup(text: string): ParsedBackup | null {
  const matches = [...text.matchAll(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(runtime\/backups\/db\/\S+\.backup)/gi)];

  if (!matches.length) {
    return null;
  }

  const backups = matches.map<ParsedBackup>((match) => ({
    timestamp: `${match[1]}T${match[2]}${match[2].length === 5 ? ":00" : ""}Z`,
    path: match[3],
  }));

  backups.sort((a, b) => getTimestamp(a.timestamp) - getTimestamp(b.timestamp));

  return backups.at(-1) ?? null;
}

function calculateNextBackup({ backupTime, intervalHours, lastBackupTimestamp }: { backupTime: string | null; intervalHours: number | null; lastBackupTimestamp: TimestampValue }): string | null {
  const now = Date.now();

  if (lastBackupTimestamp) {
    const last = getTimestamp(lastBackupTimestamp);

    if (Number.isFinite(last) && intervalHours && intervalHours > 0) {
      const interval = intervalHours * 60 * 60 * 1000;
      let next = last + interval;

      while (next <= now) {
        next += interval;
      }

      return new Date(next).toISOString();
    }
  }

  if (!backupTime) {
    return null;
  }

  const match = backupTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date();

  date.setUTCHours(hour, minute, second, 0);

  if (date.getTime() <= now) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString();
}

function formatLastBackup(timestamp: string): string {
  return formatLastBackupUnknown(timestamp);
}

function formatLastBackupUnknown(value: unknown): string {
  const discord = discordTimestampUnknown(value);

  if (!discord) {
    return UNAVAILABLE;
  }

  return `${discord} • ${relativeTimestampUnknown(value)}`;
}

function discordTimestampUnknown(value: unknown): string | null {
  const timestamp = getTimestampFromUnknown(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

function relativeTimestampUnknown(value: unknown): string {
  const timestamp = getTimestampFromUnknown(value);

  if (!Number.isFinite(timestamp)) {
    return UNAVAILABLE;
  }

  return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

function getTimestampFromUnknown(value: unknown): number {
  if (typeof value === "string" || typeof value === "number" || value instanceof Date || value === null || value === undefined) {
    return getTimestamp(value);
  }

  if (isObject(value)) {
    return getTimestamp(getFirstDefined(value, ["timestamp", "createdAt", "created_at", "date"]) as TimestampValue);
  }

  return NaN;
}

function getTimestamp(value: TimestampValue): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }

  if (!value) {
    return NaN;
  }

  const text = value.trim();

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);

    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const normalized = text.endsWith("Z") ? text : text.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})$/, "$1Z");

  return Date.parse(normalized);
}

function extractValue(text: string, regex: RegExp): string | null {
  return text.match(regex)?.[1]?.trim() || null;
}

function extractBoolean(text: string, regex: RegExp): boolean {
  const match = text.match(regex);

  return match ? getBoolean(match[1]) : false;
}

function detectTimerStatus(text: string): string {
  return text.match(/Systemd timer:\s*(enabled|disabled|active|inactive)/i)?.[1]?.toLowerCase() ?? UNAVAILABLE;
}

function getBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    return ["true", "yes", "enabled", "active", "running", "on"].includes(normalized);
  }

  return false;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function emptyAutoBackup(): AutoBackupDisplay {
  return {
    enabled: false,
    backupTime: null,
    intervalHours: null,
    retentionDays: null,
    directory: null,
    timerStatus: null,
    timerUnit: null,
    serviceUnit: null,
    nextBackup: UNAVAILABLE,
    lastBackup: UNAVAILABLE,
  };
}

function formatLabel(value: unknown): string {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFilename(path: unknown): string {
  const normalized = String(path).replaceAll("\\", "/");

  return normalized.split("/").pop() || normalized;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (isObject(value)) {
    return `\`${JSON.stringify(value)}\``;
  }

  return `\`${String(value)}\``;
}

function formatBytes(bytes: unknown): string {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value < 0) {
    return "Unknown size";
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

  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function getErrorDetails(error: unknown): {
  message: string;
  status: number | string | null;
} {
  if (!isObject(error)) {
    return {
      message: String(error),
      status: null,
    };
  }

  const details = asObject(error.details);

  const message = typeof error.message === "string" ? error.message : typeof details?.error === "string" ? details.error : "Unknown error";

  const statusValue = error.status ?? details?.status;

  const status = typeof statusValue === "number" || typeof statusValue === "string" ? statusValue : null;

  return {
    message,
    status,
  };
}

function createBackupBanner({ serverName, count }: { serverName: string; count: number }) {
  return createDuneBanner({
    filename: IMAGE_NAME,
    title: "Backups",
    subtitle: `${count} AVAILABLE`,
    detail: serverName,
  });
}
