import type { Client } from "discord.js";
import { Connectors, Shoukaku, type Player } from "shoukaku";
import type { MusicConfig } from "../config/music";

export interface MusicEvents {
  ready: () => void;
  started: (requestId: string) => void;
  ended: (requestId: string) => void;
  failed: (requestId?: string) => void;
}

export class LavalinkConnection {
  private readonly manager: Shoukaku;
  private readonly watched = new WeakSet<Player>();
  private readonly retiring = new WeakSet<Player>();

  public constructor(client: Client, config: MusicConfig, private readonly events: MusicEvents) {
    this.manager = new Shoukaku(new Connectors.DiscordJS(client), [
      { name: "music", url: config.url, auth: config.password, secure: config.secure },
    ], { resume: false, resumeByLibrary: false, reconnectTries: Number.MAX_SAFE_INTEGER, reconnectInterval: 10, restTimeout: 15, voiceConnectionTimeout: 15 });
    this.manager.on("error", () => client.logger.warn("Lavalink connection error; check its address, TLS, password, and server logs."));
    this.manager.on("ready", () => events.ready());
    this.manager.on("close", () => events.failed());
  }

  public available(): boolean { return Boolean(this.manager.getIdealNode()); }
  public player(guildId: string): Player | undefined { return this.manager.players.get(guildId); }
  public async freezePosition(guildId: string, requestId: string): Promise<number | undefined> {
    const player = this.player(guildId);
    if (!player) return undefined;
    const snapshot = await player.node.rest.updatePlayer({ guildId, playerOptions: { paused: true } });
    if (!snapshot?.track || trackRequestId({ track: snapshot.track }) !== requestId) return undefined;
    // Lavalink v4 includes player state, omitted from this Shoukaku version's REST types.
    const position = (snapshot as typeof snapshot & { state?: { position?: number } }).state?.position ?? snapshot.track.info.position;
    return Number.isFinite(position) && position >= 0 ? position : undefined;
  }
  public async resolve(query: string) {
    const node = this.manager.getIdealNode();
    if (!node) throw new Error("Lavalink unavailable.");
    return node.rest.resolve(query);
  }

  public async join(guildId: string, channelId: string, shardId: number): Promise<Player> {
    const player = await this.manager.joinVoiceChannel({ guildId, channelId, shardId, deaf: true });
    if (!this.watched.has(player)) {
      this.watched.add(player);
      player.on("start", (event) => {
        if (this.retiring.has(player)) return;
        const id = trackRequestId(event);
        if (id) this.events.started(id);
      });
      player.on("end", (event) => {
        if (this.retiring.has(player)) return;
        if (event.reason === "finished" || event.reason === "loadFailed") {
          const id = trackRequestId(event);
          if (id) {
            if (event.reason === "loadFailed") this.events.failed(id);
            else this.events.ended(id);
          }
        }
      });
      player.on("stuck", (event) => { if (!this.retiring.has(player)) this.events.failed(trackRequestId(event)); });
      player.on("exception", (event) => { if (!this.retiring.has(player)) this.events.failed(trackRequestId(event)); });
      player.on("closed", () => { if (!this.retiring.has(player)) this.events.failed(); });
    }
    return player;
  }

  public async leave(guildId: string): Promise<void> {
    const player = this.player(guildId);
    if (player) this.retiring.add(player);
    await this.manager.leaveVoiceChannel(guildId);
  }
  public async close(guildId: string): Promise<void> {
    try { await this.leave(guildId); }
    finally { for (const name of this.manager.nodes.keys()) this.manager.removeNode(name, "Bot shutdown"); }
  }
}

function trackRequestId(event: unknown): string | undefined {
  if (!event || typeof event !== "object" || !("track" in event)) return undefined;
  const track = event.track;
  if (!track || typeof track !== "object" || !("userData" in track)) return undefined;
  const data = track.userData;
  return data && typeof data === "object" && "requestId" in data && typeof data.requestId === "string" ? data.requestId : undefined;
}
