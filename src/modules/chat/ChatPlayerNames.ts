import type { DuneApi } from "../../infrastructure/http/dune-console/DuneApi";

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

/** Bounded, shared player directory: chat uses Funcom IDs, not character names. */
export class ChatPlayerNames {
  private names = new Map<string, string>();
  private refreshAt = 0;
  private pending?: Promise<void>;

  public constructor(private readonly api: Pick<DuneApi, "call">) {}

  public readonly resolve = async (sender: string): Promise<string> => {
    if (Date.now() >= this.refreshAt && !this.pending) {
      this.pending = this.refresh()
        .then(() => { this.refreshAt = Date.now() + 60_000; })
        .catch(() => { this.names.clear(); this.refreshAt = Date.now() + 15_000; })
        .finally(() => { this.pending = undefined; });
    }
    if (this.pending) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.pending,
        new Promise<void>((resolve) => { timer = setTimeout(resolve, 1_500); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
    }
    return this.names.get(sender) ?? sender;
  };

  private async refresh(): Promise<void> {
    const players = new Map<string, { names: Set<string>; online: boolean }>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.api.call("GET", "/api/players", { query: { page, pageSize: PAGE_SIZE, status: "all" } });
      if (!result || typeof result !== "object" || !("rows" in result) || !Array.isArray(result.rows)) throw new Error("Invalid player directory.");
      for (const row of result.rows.slice(0, PAGE_SIZE)) {
        if (!row || typeof row.funcom_id !== "string" || !row.funcom_id
          || typeof row.character_name !== "string" || !row.character_name.trim()) continue;
        const name = row.character_name.trim();
        if (name.length > 100 || [...name].some((c) => c.charCodeAt(0) < 32)) continue;
        const online = (row.actual_online_status ?? row.online_status) === "Online";
        const existing = players.get(row.funcom_id);
        if (!existing || (online && !existing.online)) {
          players.set(row.funcom_id, { names: new Set([name]), online });
        } else if (existing.online === online) {
          existing.names.add(name);
        }
      }
      const total = "totalCount" in result ? Number(result.totalCount) : NaN;
      if (result.rows.length < PAGE_SIZE || (Number.isFinite(total) && (page + 1) * PAGE_SIZE >= total)) break;
      if (page === MAX_PAGES - 1) throw new Error("Player directory exceeds the chat lookup limit.");
    }
    // Do not guess when an account has multiple equally eligible characters.
    this.names = new Map([...players].filter(([, value]) => value.names.size === 1)
      .map(([id, value]) => [id, value.names.values().next().value!]));
  }
}
