import { escapeMarkdown } from "discord.js";

import type { DuneApi } from "../../../infrastructure/http/dune-console/DuneApi";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";

interface SolariEntry {
  id: string;
  name: string;
  /** Decimal string; BIGINT-safe until formatting. */
  balance: string;
}

interface SolariSnapshot {
  entries: SolariEntry[];
  failed: number;
  truncated: boolean;
  generatedAt: number;
}

type DuneCaller = Pick<DuneApi, "call">;

const PLAYER_PAGE_SIZE = 100;
const MAX_PLAYER_PAGES = 20;
const MAX_PLAYERS = PLAYER_PAGE_SIZE * MAX_PLAYER_PAGES;
const BALANCE_CONCURRENCY = 8;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_NAME_LENGTH = 32;
const UNKNOWN_NAME = "Unknown player";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function readId(row: Record<string, unknown>): string | null {
  for (const key of ["player_id", "playerId", "pawn_id", "pawnId"]) {
    const value = row[key];
    if ((typeof value === "string" && value.trim()) || typeof value === "number" || typeof value === "bigint") return String(value).trim();
  }

  return null;
}

function readName(row: Record<string, unknown>): string {
  for (const key of ["character_name", "characterName", "name"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return UNKNOWN_NAME;
}

/** Normalizes an API balance into an integer decimal string, or null when it is not a valid integer amount. */
function parseBalance(value: unknown): string | null {
  if (typeof value === "bigint") return value.toString();

  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)).toString() : null;
  }

  if (typeof value !== "string") return null;

  const text = value.trim();
  const match = /^(-?\d+)(?:\.\d+)?$/.exec(text);
  return match ? BigInt(match[1]).toString() : null;
}

function parseSolariTotal(response: unknown): string | null {
  return isRecord(response) ? parseBalance(response.total) : null;
}

function compareBalances(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a > b ? -1 : 1;
}

function sortEntries(entries: SolariEntry[]): SolariEntry[] {
  return [...entries].sort((left, right) => compareBalances(left.balance, right.balance) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function formatSolari(balance: string): string {
  const negative = balance.startsWith("-");
  const digits = negative ? balance.slice(1) : balance;
  return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatEntryName(name: string): string {
  return escapeMarkdown(truncateDiscordText(name.replace(/\p{Cc}/gu, " "), MAX_NAME_LENGTH, "…"));
}

function countPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

function formatRank(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;
}

function formatLeaderboardPage(entries: SolariEntry[], page: number, pageSize: number): string {
  const start = (page - 1) * pageSize;
  const rows = entries.slice(start, start + pageSize);

  if (!rows.length) return "No players with a readable Solari balance were found.";

  return rows.map((entry, index) => `${formatRank(start + index + 1)} ${formatEntryName(entry.name)} — **${formatSolari(entry.balance)}** Solari`).join("\n");
}

async function listPlayers(api: DuneCaller): Promise<{ players: Map<string, string>; truncated: boolean }> {
  const players = new Map<string, string>();
  let truncated = false;

  for (let apiPage = 0; apiPage < MAX_PLAYER_PAGES; apiPage++) {
    const response = await api.call("GET", "/api/players", { query: { status: "all", page: apiPage, pageSize: PLAYER_PAGE_SIZE } });

    if (!isRecord(response) || !Array.isArray(response.rows)) throw new Error("Invalid player directory response.");

    for (const row of response.rows) {
      if (!isRecord(row)) continue;
      const id = readId(row);
      if (id && !players.has(id)) players.set(id, readName(row));
    }

    const total = Number(response.totalCount);
    if (response.rows.length < PLAYER_PAGE_SIZE || (Number.isFinite(total) && (apiPage + 1) * PLAYER_PAGE_SIZE >= total)) break;
    if (apiPage === MAX_PLAYER_PAGES - 1) truncated = true;
  }

  return { players, truncated };
}

async function fetchSolariSnapshot(api: DuneCaller, now = Date.now()): Promise<SolariSnapshot> {
  const { players, truncated } = await listPlayers(api);
  const queue = [...players];
  const entries: SolariEntry[] = [];
  let failed = 0;

  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [id, name] = next;

      try {
        const balance = parseSolariTotal(await api.call("GET", "/api/players/{playerId}/solaris-coin", { routeParams: { playerId: id } }));
        if (balance === null) failed++;
        else entries.push({ id, name, balance });
      } catch {
        failed++;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(BALANCE_CONCURRENCY, queue.length) }, worker));

  if (!entries.length && failed > 0) throw new Error("No Solari balances could be retrieved.");

  return { entries: sortEntries(entries), failed, truncated, generatedAt: now };
}

let cached: SolariSnapshot | null = null;
let pending: Promise<SolariSnapshot> | null = null;

/** Returns a shared snapshot cached for five minutes; simultaneous callers share a single Console crawl. */
async function getSolariSnapshot(api: DuneCaller, now = Date.now()): Promise<SolariSnapshot> {
  if (cached && now - cached.generatedAt < CACHE_TTL_MS) return cached;

  pending ??= fetchSolariSnapshot(api, now)
    .then((snapshot) => (cached = snapshot))
    .finally(() => {
      pending = null;
    });

  return pending;
}

function resetSolariSnapshotCache(): void {
  cached = null;
  pending = null;
}

export { BALANCE_CONCURRENCY, CACHE_TTL_MS, MAX_PLAYERS, compareBalances, countPages, fetchSolariSnapshot, formatEntryName, formatLeaderboardPage, formatSolari, getSolariSnapshot, parseBalance, parseSolariTotal, resetSolariSnapshotCache, sortEntries };
export type { SolariEntry, SolariSnapshot };
