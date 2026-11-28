import { escapeMarkdown } from "discord.js";

import type { DuneApi } from "../../../infrastructure/http/dune-console/DuneApi";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";

interface SolariEntry {
  id: string;
  name: string;
  /** Banked Solari Credit (the in-game bank), decimal string. */
  bank: string;
  /** Solaris coins carried in the character's inventories, decimal string. */
  coins: string;
  /** bank + coins; decimal string, BIGINT-safe until formatting. This is what the ranking uses. */
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
const BALANCE_CONCURRENCY = 8;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_NAME_LENGTH = 32;
const UNKNOWN_NAME = "Unknown player";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The Console's player directory is one row per character pawn and names its id `actor_id` (also `player_pawn_id`);
 * every `/api/players/{playerId}/…` route takes that id. Reading only `player_id` (which the directory never sends)
 * skipped every row, which is why the leaderboard came back empty. Older spellings are still accepted.
 */
const ID_KEYS = ["actor_id", "player_pawn_id", "pawn_id", "pawnId", "player_id", "playerId"] as const;

function readId(row: Record<string, unknown>): string | null {
  for (const key of ID_KEYS) {
    const value = row[key];
    const text = typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value).trim() : "";
    if (/^\d{1,20}$/.test(text) && text !== "0") return text;
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
  if (!isRecord(response) || response.supported === false || (isRecord(response.capabilities) && response.capabilities.solarisCoin === false)) return null;
  return parseBalance(response.total);
}

/** Banked Solari Credit from `/currency`: the row labelled "Solari Credit", or currency 0 on builds without labels. */
function parseBankCredit(response: unknown): string | null {
  if (!isRecord(response) || response.supported === false || (isRecord(response.capabilities) && response.capabilities.currency === false)) return null;
  if (!Array.isArray(response.rows)) return null;
  const rows = response.rows.filter(isRecord);
  const labelled = rows.filter((row) => typeof row.label === "string" && /solari/i.test(row.label));
  const candidates = labelled.length ? labelled : rows.filter((row) => String(row.currency_id) === "0");
  if (!candidates.length) return "0";
  return candidates.length === 1 ? parseBalance(candidates[0].balance) : null;
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

  return rows
    .map((entry, index) => `${formatRank(start + index + 1)} ${formatEntryName(entry.name)} — **${formatSolari(entry.balance)}** Solari\n-# ${formatSolari(entry.bank)} banked · ${formatSolari(entry.coins)} in coins`)
    .join("\n");
}

async function listPlayers(api: DuneCaller): Promise<{ players: Map<string, string>; truncated: boolean }> {
  const players = new Map<string, string>();
  let truncated = false;
  let listed = 0;

  for (let apiPage = 0; apiPage < MAX_PLAYER_PAGES; apiPage++) {
    const response = await api.call("GET", "/api/players", { query: { status: "all", page: apiPage, pageSize: PLAYER_PAGE_SIZE } });

    if (!isRecord(response) || !Array.isArray(response.rows)) throw new Error("Invalid player directory response.");

    for (const row of response.rows) {
      if (!isRecord(row)) continue;
      listed++;
      const id = readId(row);
      if (id && !players.has(id)) players.set(id, readName(row));
    }

    const total = Number(response.totalCount);
    if (response.rows.length < PLAYER_PAGE_SIZE || (Number.isFinite(total) && (apiPage + 1) * PLAYER_PAGE_SIZE >= total)) break;
    if (apiPage === MAX_PLAYER_PAGES - 1) truncated = true;
  }

  if (listed > 0 && players.size === 0) throw new Error("The player directory rows carry no player id.");

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
        const [currency, coin] = await Promise.all([
          api.call("GET", "/api/players/{playerId}/currency", { routeParams: { playerId: id } }),
          api.call("GET", "/api/players/{playerId}/solaris-coin", { routeParams: { playerId: id } }),
        ]);
        const bank = parseBankCredit(currency);
        const coins = parseSolariTotal(coin);
        if (bank === null || coins === null) failed++;
        else entries.push({ id, name, bank, coins, balance: (BigInt(bank) + BigInt(coins)).toString() });
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

export { CACHE_TTL_MS, compareBalances, countPages, fetchSolariSnapshot, formatEntryName, formatLeaderboardPage, formatSolari, getSolariSnapshot, parseBalance, parseBankCredit, parseSolariTotal, readId, resetSolariSnapshotCache, sortEntries };
export type { SolariEntry, SolariSnapshot };
