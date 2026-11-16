export interface DashboardRelease {
  project: "bot" | "dashboard";
  id: string;
  version: string;
  title: string;
  date: string | null;
  sections: { title: string; items: string[] }[];
}

export interface ChangelogSnapshot {
  releases: DashboardRelease[];
  fetchedAt: number;
  stale: boolean;
}

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_CACHE_AGE_MS = 300_000;
const MAX_STALE_AGE_MS = 86_400_000;
const RETRY_DELAY_MS = 30_000;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReleases(value: unknown): DashboardRelease[] {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.generatedAt !== "string" ||
      Number.isNaN(Date.parse(value.generatedAt)) || !Array.isArray(value.releases) || value.releases.length > 200) {
    throw new Error("Invalid dashboard changelog response");
  }
  const ids = new Set<string>();
  return value.releases.map((entry: unknown) => {
    if (!record(entry) || (entry.project !== "bot" && entry.project !== "dashboard") ||
        typeof entry.version !== "string" || !VERSION.test(entry.version) ||
        entry.id !== `${entry.project}:${entry.version}` || ids.has(entry.id as string) ||
        typeof entry.title !== "string" || entry.title.length < 1 || entry.title.length > 200 ||
        (entry.date !== null && (typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
          Number.isNaN(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date)) ||
        !Array.isArray(entry.sections) || entry.sections.length > 100) {
      throw new Error("Invalid dashboard release");
    }
    ids.add(entry.id as string);
    const sections = entry.sections.map((section: unknown) => {
      if (!record(section) || typeof section.title !== "string" || !section.title || section.title.length > 200 ||
          !Array.isArray(section.items) || section.items.length > 1000 ||
          !section.items.every((item: unknown) => typeof item === "string" && item.length <= 20_000)) {
        throw new Error("Invalid dashboard release section");
      }
      return { title: section.title, items: section.items as string[] };
    });
    return { project: entry.project, id: entry.id as string, version: entry.version, title: entry.title, date: entry.date as string | null, sections };
  });
}

export class DashboardChangelogClient {
  private cached?: ChangelogSnapshot;
  private pending?: Promise<ChangelogSnapshot>;
  private retryAfter = 0;
  private readonly endpoint: URL;

  public constructor(baseUrl: string, private readonly now: () => number = Date.now) {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
      throw new Error("Dashboard URL must be an HTTPS origin without credentials");
    }
    this.endpoint = new URL("/api/v2/changelog", base);
  }

  public async getReleases(): Promise<ChangelogSnapshot> {
    if (this.cached && this.now() - this.cached.fetchedAt < MAX_CACHE_AGE_MS) return this.cached;
    if (this.pending) return this.pending;
    if (this.now() < this.retryAfter) {
      if (this.cached && this.now() - this.cached.fetchedAt <= MAX_STALE_AGE_MS) return { ...this.cached, stale: true };
      throw new Error("Dashboard changelog temporarily unavailable");
    }
    this.pending = this.refresh().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async refresh(): Promise<ChangelogSnapshot> {
    try {
      const response = await fetch(this.endpoint, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!response.ok || !response.body) throw new Error("Dashboard changelog unavailable");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_RESPONSE_BYTES) throw new Error("Dashboard changelog response too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const releases = parseReleases(parsed);
      this.cached = { releases, fetchedAt: this.now(), stale: false };
      this.retryAfter = 0;
      return this.cached;
    } catch (error) {
      this.retryAfter = this.now() + RETRY_DELAY_MS;
      if (this.cached && this.now() - this.cached.fetchedAt <= MAX_STALE_AGE_MS) return { ...this.cached, stale: true };
      throw new Error("Dashboard changelog temporarily unavailable", { cause: error });
    }
  }
}
