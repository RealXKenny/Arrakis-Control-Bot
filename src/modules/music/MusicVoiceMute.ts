import { PermissionFlagsBits, type Client, type VoiceState } from "discord.js";
import type { MusicMuteStorage } from "../../infrastructure/database/music/MusicMuteRepository";
import { scopedLogger, type Logger } from "../../client/logger";

export class MusicVoiceMute {
  private readonly owned = new Set<string>();
  private readonly tasks = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private recovering = false;
  private lastWarning = 0;
  private readonly logger: Logger;

  public constructor(private readonly client: Client, private readonly guildId: string,
    private readonly voiceId: string, private readonly storage: MusicMuteStorage) {
    this.logger = scopedLogger(client.logger, "MUSIC");
  }

  public async initialize(): Promise<void> {
    // Dev note: We only unmute what we muted; even bots should clean up their own mess.
    await this.storage.initialize();
    for (const id of await this.storage.list(this.guildId)) this.owned.add(id);
  }
  public start(): void {
    if (this.timer) return;
    this.recover();
    this.timer = setInterval(() => this.recover(), 30_000);
  }
  public async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.allSettled(this.tasks.values());
  }
  public async onVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (newState.guild.id !== this.guildId) return;
    const moved = oldState.channelId !== newState.channelId;
    const unmutedInside = newState.channelId === this.voiceId && oldState.serverMute && !newState.serverMute && this.owned.has(newState.id);
    if (!moved && !unmutedInside) return;
    if (newState.channelId !== this.voiceId && !this.owned.has(newState.id)) return;
    // Dev note: The lounge has a bouncer; manual unmute attempts do not make the guest list.
    await this.schedule(newState.id);
  }

  private async schedule(userId: string): Promise<void> {
    if (this.stopped) return;
    const previous = this.tasks.get(userId) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(() => this.update(userId));
    this.tasks.set(userId, task);
    try { await task; }
    catch { this.warn(); }
    finally { if (this.tasks.get(userId) === task) this.tasks.delete(userId); }
  }

  private async update(userId: string): Promise<void> {
    if (this.stopped) return;
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild?.available) return;
    // Dev note: For who is actually connected, the voice cache gets the final say.
    const voice = guild.voiceStates.cache.get(userId);
    if (!voice?.channelId) return; // Dev note: Discord cannot unmute ghosts; retry when they reconnect.
    const expectedChannel = voice.channelId;
    const member = voice.member ?? await guild.members.fetch(userId);
    if (member.user.bot) return;
    const inside = voice.channelId === this.voiceId;
    const owned = this.owned.has(userId);
    if (!inside && !owned) return;
    if (inside && voice.serverMute) return; // Dev note: Moderator mutes outrank the DJ.
    if (!inside && !voice.serverMute) {
      await this.storage.remove(this.guildId, userId);
      this.owned.delete(userId);
      return;
    }
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!voice.channel?.permissionsFor(me)?.has(PermissionFlagsBits.MuteMembers)) throw new Error("Missing Mute Members permission.");
    if (!owned) {
      // Dev note: Write the receipt before touching Discord; crashes have terrible memories.
      await this.storage.add(this.guildId, userId);
      this.owned.add(userId);
    }
    // Dev note: Awaited calls create plot twists, so check the channel again.
    const latest = guild.voiceStates.cache.get(userId);
    if (latest?.channelId !== expectedChannel) return;
    await latest.setMute(inside, inside ? "Music lounge: listen-only" : "Left music lounge: restore voice access");
    if (!inside) {
      await this.storage.remove(this.guildId, userId);
      this.owned.delete(userId);
    }
  }

  private recover(): void {
    if (this.stopped || this.recovering) return;
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild?.available) return;
    this.recovering = true;
    const ids = new Set(this.owned);
    for (const voice of guild.voiceStates.cache.values()) if (voice.channelId === this.voiceId) ids.add(voice.id);
    void (async () => { for (const id of ids) { if (this.stopped) break; await this.schedule(id); } })()
      .finally(() => { this.recovering = false; });
  }
  private warn(): void {
    if (Date.now() - this.lastWarning < 60_000) return;
    this.lastWarning = Date.now();
    this.logger.warn("Music lounge mute/unmute failed; recovery will retry. Check Mute Members permissions and PostgreSQL.");
  }
}
