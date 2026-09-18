import type { Client } from "discord.js";
import { Connectors, Shoukaku, type Player, type TrackEndEvent } from "shoukaku";
import type { MusicConfig } from "../config/music";

export interface MusicEvents {
  ready: () => void;
  ended: (requestId: string) => void;
  failed: (requestId?: string) => void;
}

export class LavalinkConnection {
  private readonly manager: Shoukaku;
  private readonly watched = new WeakSet<Player>();

  public constructor(client: Client, config: MusicConfig, private readonly events: MusicEvents) {
    this.manager = new Shoukaku(new Connectors.DiscordJS(client), [
      { name: "music", url: config.url, auth: config.password, secure: config.secure },
    ], { resume: false, resumeByLibrary: false, reconnectTries: Number.MAX_SAFE_INTEGER, reconnectInterval: 10, restTimeout: 15, voiceConnectionTimeout: 15 });
    this.manager.on("error", () => client.logger.warn("Lavalink connection error; check its address, TLS, password, and server logs."));
    this.manager.on("ready", () => events.ready());
  }

  public available(): boolean { return Boolean(this.manager.getIdealNode()); }
  public player(guildId: string): Player | undefined { return this.manager.players.get(guildId); }
  public async resolve(query: string) {
    const node = this.manager.getIdealNode();
    if (!node) throw new Error("Lavalink unavailable.");
    return node.rest.resolve(query);
  }

  public async join(guildId: string, channelId: string, shardId: number): Promise<Player> {
    const player = await this.manager.joinVoiceChannel({ guildId, channelId, shardId, deaf: true });
    if (!this.watched.has(player)) {
      this.watched.add(player);
      player.on("end", (event) => {
        if (event.reason === "finished" || event.reason === "loadFailed") {
          const id = trackRequestId(event);
          if (id) this.events.ended(id);
        }
      });
      player.on("stuck", (event) => this.events.failed(trackRequestId(event)));
      player.on("exception", () => this.events.failed());
    }
    return player;
  }

  public async leave(guildId: string): Promise<void> { await this.manager.leaveVoiceChannel(guildId); }
  public async close(guildId: string): Promise<void> {
    try { await this.leave(guildId); }
    finally { for (const name of this.manager.nodes.keys()) this.manager.removeNode(name, "Bot shutdown"); }
  }
}

function trackRequestId(event: Pick<TrackEndEvent, "track">): string | undefined {
  const data = (event.track as typeof event.track & { userData?: { requestId?: unknown } }).userData;
  return typeof data?.requestId === "string" ? data.requestId : undefined;
}
