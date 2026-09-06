type PlayerRecord = Record<string, unknown>;

type PlayerResponse =
  | PlayerRecord[]
  | {
      rows?: unknown;
      players?: unknown;
      data?: unknown;
      results?: unknown;

      total?: unknown;
      totalCount?: unknown;
      totalPlayers?: unknown;
      count?: unknown;

      pagination?: {
        total?: unknown;
      };

      meta?: {
        total?: unknown;
      };
    }
  | null
  | undefined;

interface FormattedPlayers {
  heading: string;
  content: string;
  truncated: string | null;
  count: number;
}

function formatPlayers(response: PlayerResponse, status: string): FormattedPlayers {
  const rows = getPlayerRows(response);
  const total = getPlayerTotal(response, rows);

  const listedPlayers = rows.slice(0, 20).map(formatPlayer).join("\n");

  const shown = Math.min(rows.length, 20);
  const remaining = Math.max(0, total - shown);

  return {
    heading: `${status === "online" ? "Online" : "Offline"} Players (${total.toLocaleString()})`,

    content: listedPlayers || "No players found.",

    truncated: remaining > 0 ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} players.` : null,

    count: total,
  };
}

function getPlayerRows(response: PlayerResponse): PlayerRecord[] {
  if (Array.isArray(response)) {
    return response.filter(isPlayerRecord);
  }

  if (!response || typeof response !== "object") {
    return [];
  }

  const possibleRows = [response.rows, response.players, response.data, response.results];

  for (const value of possibleRows) {
    if (Array.isArray(value)) {
      return value.filter(isPlayerRecord);
    }
  }

  return [];
}

function getPlayerTotal(response: PlayerResponse, rows: PlayerRecord[]): number {
  if (!response || Array.isArray(response)) {
    return rows.length;
  }

  const values: unknown[] = [response.total, response.totalCount, response.totalPlayers, response.count, response.pagination?.total, response.meta?.total];

  const total = values.find((value) => Number.isFinite(Number(value)));

  return total !== undefined ? Number(total) : rows.length;
}

function formatPlayer(player: PlayerRecord, index: number): string {
  const name = player.character_name ?? player.characterName ?? player.name ?? player.playerName ?? player.display_name ?? player.displayName ?? "Unknown player";

  const id = player.player_id ?? player.playerId ?? player.id ?? player.player_controller_id ?? player.playerControllerId;

  const playtime = player.total_playtime_seconds ?? player.totalPlaytimeSeconds ?? player.playtime_seconds ?? player.playtimeSeconds;

  const details = [id !== undefined && id !== null ? `ID: \`${escapeMarkdown(String(id))}\`` : null, playtime !== undefined && playtime !== null ? formatPlaytime(playtime) : null].filter((value): value is string => value !== null).join(" · ");

  const safeName = escapeMarkdown(String(name));

  return `${index + 1}. **${safeName}**${details ? ` — ${details}` : ""}`;
}

function formatPlaytime(seconds: unknown): string | null {
  const value = Number(seconds);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  const totalMinutes = Math.floor(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m played`;
  }

  return `${hours}h ${minutes}m played`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function isPlayerRecord(value: unknown): value is PlayerRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export { formatPlayers };

export type { FormattedPlayers, PlayerRecord, PlayerResponse };
