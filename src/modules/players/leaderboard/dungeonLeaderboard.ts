import { escapeMarkdown } from "discord.js";

import type { DuneApi } from "../../../infrastructure/http/dune-console/DuneApi";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import { isRecord } from "../../../shared/validation/isRecord";

/**
 * Dungeon records for `/leaderboard dungeons`: the fastest run per dungeon and difficulty, from the Console's
 * documented `GET /api/dungeons/leaderboard` (the same source as the dashboard's dungeon leaderboard). Only character
 * names are shown; controller and actor ids are never read.
 */
interface DungeonRecord {
  dungeonId: string;
  difficulty: number;
  durationMs: number;
  playerCount: number;
  runCount: number;
  party: string[];
}

interface DungeonSnapshot {
  supported: boolean;
  records: DungeonRecord[];
  generatedAt: number;
}

type DuneCaller = Pick<DuneApi, "call">;

const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_RECORDS = 2_000;
const MAX_NAME_LENGTH = 32;
const DUNGEON_ID = /^[A-Za-z0-9_]{1,96}$/;

const whole = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** `DA_Dgn_089_Radiation` → `Radiation`; `DA_Dgn_012_OldCistern` → `Old Cistern`. */
function dungeonName(id: string): string {
  const stripped = id.replace(/^DA_/i, "").replace(/^Dgn_?\d*_?/i, "");
  const words = (stripped || id).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  return words || id;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  const mmss = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

function parseDungeonBoard(response: unknown, now = Date.now()): DungeonSnapshot {
  if (!isRecord(response)) throw new Error("Invalid dungeon leaderboard response.");
  if (isRecord(response.capabilities) && response.capabilities.dungeons === false) return { supported: false, records: [], generatedAt: now };
  if (!Array.isArray(response.entries) || response.entries.length > MAX_RECORDS) throw new Error("Invalid dungeon leaderboard response.");

  const records: DungeonRecord[] = [];
  for (const entry of response.entries) {
    const best = isRecord(entry) && isRecord(entry.best) ? entry.best : null;
    if (
      !isRecord(entry) ||
      !best ||
      !whole(entry.runCount) ||
      typeof best.dungeonId !== "string" ||
      !DUNGEON_ID.test(best.dungeonId) ||
      !Number.isSafeInteger(best.difficulty) ||
      !whole(best.durationMs) ||
      !whole(best.playerCount) ||
      !Array.isArray(best.party)
    )
      throw new Error("Invalid dungeon leaderboard row.");
    const party = best.party.slice(0, 16).map((member) => (isRecord(member) && typeof member.characterName === "string" && member.characterName.trim() ? member.characterName.trim() : "Unknown character"));
    records.push({ dungeonId: best.dungeonId, difficulty: best.difficulty as number, durationMs: best.durationMs, playerCount: best.playerCount, runCount: entry.runCount, party });
  }

  records.sort((a, b) => dungeonName(a.dungeonId).localeCompare(dungeonName(b.dungeonId)) || a.difficulty - b.difficulty);
  return { supported: true, records, generatedAt: now };
}

function formatPartyName(name: string): string {
  return escapeMarkdown(truncateDiscordText(name.replace(/\p{Cc}/gu, " "), MAX_NAME_LENGTH, "…"));
}

function formatDungeonPage(records: DungeonRecord[], page: number, pageSize: number): string {
  const start = (page - 1) * pageSize;
  const rows = records.slice(start, start + pageSize);
  if (!rows.length) return "No dungeon runs have been recorded on this server yet.";

  return rows
    .map((record) => {
      const party = record.party.map(formatPartyName).join(", ") || "—";
      const extra = record.playerCount > record.party.length ? ` +${record.playerCount - record.party.length}` : "";
      return `**${escapeMarkdown(dungeonName(record.dungeonId))}** · Difficulty ${record.difficulty} — ⏱️ **${formatDuration(record.durationMs)}**\n-# ${party}${extra} · ${record.runCount.toLocaleString()} run${record.runCount === 1 ? "" : "s"}`;
    })
    .join("\n");
}

let cached: DungeonSnapshot | null = null;
let pending: Promise<DungeonSnapshot> | null = null;

/** Shared five-minute snapshot; simultaneous callers share one Console request. */
async function getDungeonSnapshot(api: DuneCaller, now = Date.now()): Promise<DungeonSnapshot> {
  if (cached && now - cached.generatedAt < CACHE_TTL_MS) return cached;

  pending ??= api
    .call("GET", "/api/dungeons/leaderboard")
    .then((response) => (cached = parseDungeonBoard(response, now)))
    .finally(() => {
      pending = null;
    });

  return pending;
}

function resetDungeonSnapshotCache(): void {
  cached = null;
  pending = null;
}

export { dungeonName, formatDungeonPage, formatDuration, getDungeonSnapshot, parseDungeonBoard, resetDungeonSnapshotCache };
export type { DungeonRecord, DungeonSnapshot };
