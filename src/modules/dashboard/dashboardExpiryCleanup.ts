interface ExpiryStore { purgeExpired(): Promise<void> }
interface NamedStore { name: string; store: ExpiryStore }

/** Runs idempotent expiry cleanup without overlapping this process's previous run. */
export class DashboardExpiryCleanup {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  public constructor(
    private readonly stores: readonly NamedStore[],
    private readonly onError: (name: string, error: unknown) => void,
    private readonly intervalMs = 15 * 60_000,
  ) {
    if (!Number.isInteger(intervalMs) || intervalMs < 1_000) throw new Error("Invalid dashboard cleanup interval");
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.run(); }, this.intervalMs);
    this.timer.unref();
  }

  public async run(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = Promise.all(this.stores.map(async ({ name, store }) => {
      try { await store.purgeExpired(); } catch (error) {
        // A failed log callback must not make a timer create an unhandled rejection.
        try { this.onError(name, error); } catch { /* Continue cleaning other stores. */ }
      }
    })).then(() => undefined).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.pending;
  }
}
