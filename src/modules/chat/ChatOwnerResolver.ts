import type { Client } from "discord.js";
import type { DiscordAdapterClient } from "../../infrastructure/http/discord-adapter/DiscordAdapterClient";
import type { DuneApi } from "../../infrastructure/http/dune-console/DuneApi";

type OwnerClient = Client & { discordAdapter?: DiscordAdapterClient | null; duneApi: DuneApi };

/** Resolve only verified player links belonging to members of the configured role. */
export class ChatOwnerResolver {
  private readonly cache = new Map<string, { expires: number; owners: Promise<Map<string, string>> }>();

  public constructor(private readonly client: OwnerClient, private readonly roleId?: string) {}

  public readonly isOwner = async (guildId: string, sender: string): Promise<boolean> => {
    if (!this.roleId || !this.client.discordAdapter) return false;
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return false;
    let entry = this.cache.get(guildId);
    if (!entry || entry.expires <= Date.now()) {
      entry = { expires: Date.now() + 60_000, owners: this.load(guildId).catch(() => new Map()) };
      this.cache.set(guildId, entry);
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const owners = await Promise.race([
      entry.owners,
      new Promise<Map<string, string>>((resolve) => { timer = setTimeout(() => resolve(new Map()), 2_000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    const memberId = owners.get(sender);
    // Honor role removals observed by Discord without waiting for the next refresh.
    return Boolean(memberId && guild.members.cache.get(memberId)?.roles.cache.has(this.roleId));
  };

  private async load(guildId: string): Promise<Map<string, string>> {
    const owners = new Map<string, string>();
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild || !this.roleId || !this.client.discordAdapter) return owners;
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      if (member.user.bot || !member.roles.cache.has(this.roleId)) continue;
      try {
        const linked = await this.client.discordAdapter.getCurrentPlayer({ userId: member.id, commandName: "chat-owner-label" });
        if (linked?.linked !== true || linked.pawnId == null) continue;
        const profile = await this.client.duneApi.call("GET", "/api/players/{playerId}", { routeParams: { playerId: String(linked.pawnId) } });
        if (!profile || typeof profile !== "object" || !("player" in profile)) continue;
        const player = profile.player;
        if (player && typeof player === "object" && "funcom_id" in player && typeof player.funcom_id === "string" && player.funcom_id) {
          owners.set(player.funcom_id, member.id);
        }
      } catch { /* A missing link/profile must not prevent chat delivery or label another player. */ }
    }
    return owners;
  }
}
