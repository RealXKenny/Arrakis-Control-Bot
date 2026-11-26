/**
 * Per-user cooldowns for commands that call slow upstream services. They stack on top of the
 * short global interaction cooldown and answer with a clear wait time instead of queueing work.
 * Keys are the grouped action's legacy name.
 */
const COMMAND_COOLDOWNS_MS: Readonly<Record<string, number>> = {
  players: 10_000,
  profile: 10_000,
  status: 10_000,
  servers: 10_000,
  backups: 10_000,
  "download-backup": 60_000,
  "create-backup": 60_000,
  "import-backup": 60_000,
  "check-game-update": 30_000,
  "check-stack-update": 30_000,
};

class CommandCooldowns {
  private readonly expiries = new Map<string, number>();

  public constructor(private readonly maxEntries = 10_000) {}

  /** Returns 0 and starts the cooldown when allowed, otherwise the milliseconds left. */
  public take(userId: string, command: string, now = Date.now()): number {
    const durationMs = COMMAND_COOLDOWNS_MS[command];
    if (!durationMs) return 0;
    const key = `${userId}:${command}`;
    const expiresAt = this.expiries.get(key);
    if (expiresAt !== undefined && expiresAt > now) return expiresAt - now;
    if (this.expiries.size >= this.maxEntries) this.sweep(now);
    if (this.expiries.size >= this.maxEntries) {
      const oldest = this.expiries.keys().next().value;
      if (oldest !== undefined) this.expiries.delete(oldest);
    }
    this.expiries.delete(key);
    this.expiries.set(key, now + durationMs);
    return 0;
  }

  public get size(): number { return this.expiries.size; }

  private sweep(now: number): void {
    for (const [key, expiresAt] of this.expiries) if (expiresAt <= now) this.expiries.delete(key);
  }
}

const commandCooldowns = new CommandCooldowns();

function cooldownMessage(remainingMs: number): string {
  return `That command is cooling down. Try again in ${Math.ceil(remainingMs / 1_000)} seconds.`;
}

export { CommandCooldowns, commandCooldowns, cooldownMessage };
