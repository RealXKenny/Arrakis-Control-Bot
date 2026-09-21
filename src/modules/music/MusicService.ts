import { randomUUID } from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, escapeMarkdown, PermissionFlagsBits, type Client, type Guild, type Message, type VoiceState } from "discord.js";
import type { MusicVoiceMute } from "./MusicVoiceMute";
import type { Player, Track } from "shoukaku";
import type { MusicQueueEntry as QueueEntry, MusicState, MusicStorage } from "../../infrastructure/database/music/MusicRepository";
import { LavalinkConnection } from "../../infrastructure/audio/LavalinkConnection";
import type { MusicConfig } from "../../infrastructure/config/music";
import { loadedTracks, musicQuery, MusicUserError } from "./musicTracks";
import { MusicPanelPublisher } from "./musicPanel";
import { MusicNowPlayingPanel, NOW_PLAYING_MARKER } from "./MusicNowPlayingPanel";

import { MusicLyrics } from "./musicLyrics";
import { playbackProgress } from "./musicProgress";
import { scopedLogger, type Logger } from "../../client/logger";
import { createDuneBanner } from "../../shared/discord/imageFactory";

export type MusicAction = "skip" | "pause" | "resume" | "stop" | "clear" | "volume";

export interface MusicAuditSnapshot {
  available: boolean;
  connected: boolean;
  paused: boolean;
  volume: number;
  position: number;
  current?: {
    title: string;
    artist: string;
    requester: string;
    source: string;
    duration: number;
    uri?: string;
  };
  queue: Array<{ title: string; artist: string; requester: string }>;
}

export class MusicService {
  private readonly backend: LavalinkConnection;
  private readonly lyrics = new MusicLyrics();
  private readonly queue: QueueEntry[] = [];
  private current?: QueueEntry;
  private idleCurrent?: QueueEntry;
  private idleTracks: Track[] = [];
  private idleIndex = 0;
  private idleLoading?: Promise<void>;
  private paused = false;
  private volume: number;
  private chain: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;
  private stopped = false;
  private recovering = false;
  private retryAfter = 0;
  private restoringId?: string;
  private resetConnection = false;
  private interruptionVersion = 0;
  private readonly panel: MusicPanelPublisher;
  private lastPanelWarning = 0;
  private position = 0;
  private progress?: { id: string; position: number; at: number };
  private initialized = false;
  private initialization?: Promise<void>;
  private checkpointTimer?: ReturnType<typeof setInterval>;
  private checkpointPending = false;
  private lastCheckpointWarning = 0;
  private pendingEnd?: { id: string };
  private lastAnnouncedId?: string;
  private lastProgressCardAt = 0;
  private announcements: Promise<void> = Promise.resolve();
  private readonly nowPlayingPanel: MusicNowPlayingPanel;
  private readonly logger: Logger;

  public constructor(private readonly client: Client, public readonly config: MusicConfig, private readonly storage: MusicStorage, private readonly voiceMute?: MusicVoiceMute) {
    this.logger = scopedLogger(client.logger, "MUSIC");
    this.volume = config.volume;
    this.panel = new MusicPanelPublisher(client, config.requestChannelId, config.voiceChannelId);
    this.nowPlayingPanel = new MusicNowPlayingPanel(client, config.requestChannelId);
    this.backend = new LavalinkConnection(client, config, {
      ready: () => { this.capturePosition(); this.resetConnection = true; this.recover(); },
      started: (id) => { if (this.restoringId === id) this.restoringId = undefined; this.announceTrack(id); },
      ended: (id) => this.finish(id),
      failed: (id) => this.interrupted(id),
    });
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.voiceMute?.start();
    this.recover();
    this.checkpointTimer = setInterval(() => {
      if (this.checkpointPending || this.stopped || (!this.current && !this.idleCurrent) || !this.client.guilds.cache.has(this.config.guildId)) return;
      if (!this.current) {
        if (Date.now() - this.lastProgressCardAt >= 15_000) this.refreshSongCard();
        return;
      }
      this.checkpointPending = true;
      void this.serial(async () => {
        this.checkProgress();
        this.capturePosition();
        await this.commit(this.snapshot());
        if (Date.now() - this.lastProgressCardAt >= 15_000) this.refreshSongCard();
      }, true)
        .catch(() => {
          if (Date.now() - this.lastCheckpointWarning < 60_000) return;
          this.lastCheckpointWarning = Date.now();
          this.logger.warn("Music checkpoint failed; restart recovery will use the last saved position.");
        })
        .finally(() => { this.checkpointPending = false; });
    }, 5_000);
  }

  public initialize(): Promise<void> {
    if (!this.initialization) this.initialization = (async () => {
      await this.storage.initialize();
      await this.voiceMute?.initialize();
      const saved = await this.storage.load(this.config.guildId);
      if (saved) { this.restore(saved); this.restoringId = saved.current?.id; }
      this.initialized = true;
    })().catch((error) => { this.initialization = undefined; throw error; });
    return this.initialization;
  }

  private snapshot(): MusicState {
    return { current: this.current, queue: [...this.queue], position: this.position, paused: this.paused, volume: this.volume };
  }
  private restore(state: MusicState): void {
    this.current = state.current;
    this.queue.splice(0, this.queue.length, ...state.queue);
    this.position = state.position;
    this.paused = state.paused;
    this.volume = state.volume;
  }
  private async commit(state: MusicState): Promise<void> {
    try { await this.storage.save(this.config.guildId, state); }
    catch { throw new MusicUserError("Music could not save to the database. Please try again; the change was not confirmed."); }
    this.restore(state);
  }
  private capturePosition(): void {
    const player = this.backend.player(this.config.guildId);
    if (!this.restoringId && !this.resetConnection && this.current && player?.track === this.current.track.encoded && Number.isFinite(player.position)) {
      this.position = Math.max(0, player.position);
    }
  }

  // Dev note: Silence is golden unless a track is supposed to be playing.
  private checkProgress(): void {
    if (!this.current || this.paused || this.resetConnection || this.recovering || Date.now() < this.retryAfter) {
      this.progress = undefined;
      return;
    }
    const player = this.backend.player(this.config.guildId);
    const position = player?.track === this.current.track.encoded && Number.isFinite(player.position) ? player.position : this.position;
    if (!this.progress || this.progress.id !== this.current.id || position > this.progress.position) {
      this.progress = { id: this.current.id, position, at: Date.now() };
      return;
    }
    if (Date.now() - this.progress.at >= 30_000) {
      this.interrupted(this.current.id);
    }
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.checkpointTimer);
    try {
      await this.voiceMute?.stop();
      await this.chain.catch(() => undefined);
      await this.announcements;
      if (this.initialized && this.client.guilds.cache.has(this.config.guildId)) {
        this.capturePosition();
        if (this.current && !this.restoringId && !this.resetConnection) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const position = await Promise.race([
              this.backend.freezePosition(this.config.guildId, this.current.id),
              new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 2_000); }),
            ]);
            if (position !== undefined) this.position = position;
          } catch {
            this.logger.warn("Could not capture the final Lavalink position; using the last known playback position.");
          } finally { clearTimeout(timer); }
        }
        await this.commit(this.snapshot());
      }
    }
    finally { await this.backend.close(this.config.guildId); }
  }

  public async publishPanel(): Promise<void> {
    await this.panel.publish();
    this.refreshSongCard();
    await this.announcements;
  }

  public async onVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
    await this.voiceMute?.onVoiceState(oldState, newState);
  }

  private async serial<T>(work: () => Promise<T>, internal = false): Promise<T> {
    if (this.stopped) throw new MusicUserError("Music is shutting down. Try again shortly.");
    if (!internal && this.pending >= 20) throw new MusicUserError("Music is busy processing requests. Try again shortly.");
    this.pending++;
    const task = this.chain.catch(() => undefined).then(async () => {
      if (this.stopped) throw new MusicUserError("Music is shutting down.");
      await this.initialize();
      return work();
    });
    this.chain = task;
    try { return await task; } finally { this.pending--; }
  }

  public async authorize(guild: Guild, channelId: string, userId: string, listener = true): Promise<void> {
    if (guild.id !== this.config.guildId || channelId !== this.config.requestChannelId) {
      throw new MusicUserError("Use the configured music request channel for music commands.");
    }
    if (listener) {
      const member = await guild.members.fetch(userId);
      if (member.voice.channelId !== this.config.voiceChannelId) throw new MusicUserError("Join the music voice channel before requesting songs or changing playback.");
    }
  }

  public async request(guild: Guild, channelId: string, userId: string, query: string): Promise<string> {
    const identifier = musicQuery(query, this.config.searchPrefix);
    return this.serial(async () => {
      await this.authorize(guild, channelId, userId);
      const player = await this.ensurePlayer();
      const requestedSearch = identifier.startsWith(`${this.config.searchPrefix}:`) ? query : undefined;
      const tracks = loadedTracks(await this.backend.resolve(identifier), requestedSearch);
      await this.authorize(guild, channelId, userId);
      if (tracks.length + this.queue.length + (this.current ? 1 : 0) > this.config.maxQueue) {
        throw new MusicUserError(`That request exceeds the ${this.config.maxQueue}-song limit. Wait for space or request fewer songs.`);
      }
      await this.commit({ ...this.snapshot(), queue: [...this.queue, ...tracks.map((track) => ({ id: randomUUID(), track, requester: userId }))] });
      if (!this.current) {
        try { await this.advance(player); }
        catch {
          this.interrupted();
          return "Your request is queued, but playback is reconnecting. Check /music queue before resending.";
        }
      }
      if (this.current?.id === this.lastAnnouncedId) this.refreshSongCard();
      return tracks.length === 1 ? `Added **${escapeMarkdown(tracks[0].info.title.slice(0, 180))}**.` : `Added ${tracks.length} songs to the queue.`;
    });
  }

  public async action(guild: Guild, channelId: string, userId: string, action: MusicAction, value?: number): Promise<void> {
    await this.serial(async () => {
      await this.authorize(guild, channelId, userId);
      if (action === "clear" || action === "stop") await this.requireOwnerRole(guild, userId);
      else this.requireRequester(userId);
      // Dev note: The beat may stop, but the control plane must go on.
      if (action === "clear") {
        await this.commit({ ...this.snapshot(), queue: [] });
        this.refreshSongCard();
        return;
      }
      if (action === "stop" || action === "skip") {
        const player = this.backend.available() && !this.resetConnection && Date.now() >= this.retryAfter
          ? this.backend.player(this.config.guildId) : undefined;
        if (action === "stop") {
          await this.commit({ ...this.snapshot(), current: undefined, queue: [], position: 0, paused: false });
          this.idleCurrent = undefined;
          this.restoringId = undefined;
          this.pendingEnd = undefined;
          this.progress = undefined;
          if (!player) this.interrupted();
          else try {
            if (this.config.idlePlaylistUrl) await this.playNextIdle(player);
            else await player.stopTrack();
          } catch { this.interrupted(); }
        } else {
          await this.advance(player, true);
        }
        this.refreshSongCard();
        return;
      }
      const player = await this.ensurePlayer();
      this.capturePosition();
      if (action === "volume") {
        if (value === undefined || !Number.isInteger(value) || value < 0 || value > 100) throw new MusicUserError("Volume must be from 0 to 100.");
        await this.commit({ ...this.snapshot(), volume: value });
        try { await player.setGlobalVolume(value); } catch (error) { this.resetConnection = true; throw error; }
      } else if (action === "pause" || action === "resume") {
        if (!this.current) throw new MusicUserError("Nothing is playing right now.");
        await this.commit({ ...this.snapshot(), paused: action === "pause" });
        this.progress = undefined;
        try { await player.setPaused(this.paused); } catch (error) { this.resetConnection = true; throw error; }
      }
      this.refreshSongCard();
    });
  }

  public async requireOwnerRole(guild: Guild, userId: string): Promise<void> {
    const roleId = process.env.OWNER_ROLE_ID?.trim();
    if (!roleId) throw new MusicUserError("Clear Queue and Stop Playback are unavailable until OWNER_ROLE_ID is configured.");
    const member = await guild.members.fetch({ user: userId, force: true });
    if (!member.roles.cache.has(roleId)) throw new MusicUserError("Only members with the Owner role can clear the queue or stop playback.");
  }

  public requireRequester(userId: string): void {
    if (!this.current) throw new MusicUserError("No song is playing. Playback controls become available to the next song's requester.");
    if (this.current.requester !== userId) throw new MusicUserError("Only the person who requested the current song can skip, pause, resume or change the volume.");
  }

  public describeQueue(nowOnly = false): string {
    const active = this.current ?? this.idleCurrent;
    const title = active ? escapeMarkdown(active.track.info.title.slice(0, 180)) : "Nothing playing — ready for requests";
    const lines = [`**${this.current ? this.paused ? "Paused" : "Now playing" : this.idleCurrent ? "Waiting music" : "Now playing"}:** ${title}`];
    if (active) {
      const progress = playbackProgress(this.activePosition(active), active.track.info.length, active.track.info.isStream, this.current ? this.paused : false);
      if (progress) lines.push(progress);
    }
    lines.push(`Volume: ${this.volume}% · Waiting: ${this.queue.length}`);
    if (this.idleCurrent && !this.current) lines.push("-# Waiting rotation • Your request plays immediately");
    if (!nowOnly) {
      lines.push(...this.queue.slice(0, 8).map((entry, index) => `${index + 1}. ${escapeMarkdown(entry.track.info.title.slice(0, 120))}`));
      if (this.queue.length > 8) lines.push(`…and ${this.queue.length - 8} more.`);
    }
    return lines.join("\n").slice(0, 1_990);
  }

  public auditSnapshot(): MusicAuditSnapshot {
    this.capturePosition();
    const active = this.current ?? this.idleCurrent;
    return {
      available: this.backend.available(),
      connected: Boolean(this.backend.player(this.config.guildId)),
      paused: this.paused,
      volume: this.volume,
      position: active ? this.activePosition(active) : this.position,
      current: active ? {
        title: active.track.info.title,
        artist: active.track.info.author,
        requester: this.current ? this.current.requester : "Waiting music",
        source: active.track.info.sourceName,
        duration: active.track.info.length,
        uri: active.track.info.uri,
      } : undefined,
      queue: this.queue.map((entry) => ({
        title: entry.track.info.title,
        artist: entry.track.info.author,
        requester: entry.requester,
      })),
    };
  }

  public async onMessage(message: Message): Promise<void> {
    if (!message.guild || message.guildId !== this.config.guildId || message.channelId !== this.config.requestChannelId || message.author.bot || message.webhookId || message.system || !message.content.trim()) return;
    if (!this.client.interactionRateLimiter.allow(`music-request:${message.author.id}`)) return;
    let content: string;
    try { content = await this.request(message.guild, message.channelId, message.author.id, message.content); }
    catch (error) { content = this.errorMessage(error); }
    const reply = await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
    const cleanup = setTimeout(() => {
      void Promise.allSettled([message.delete(), reply.delete()]).then((results) => {
        if (results.some((result) => result.status === "rejected")) this.logger.warn("Music request cleanup failed. Check Manage Messages in the request channel.");
      });
    }, 15_000);
    cleanup.unref();
  }

  public async lyricsMessage(requestId?: string, page = 0) {
    const entry = this.current;
    if (!entry || (requestId && requestId !== entry.id)) return { content: "The song has changed or stopped. Open View Lyrics again for the current song.", embeds: [], components: [], allowedMentions: { parse: [] as never[] } };
    return this.lyrics.message(entry.track, entry.id, page);
  }

  public nowPlayingMessage() {
    const embed = new EmbedBuilder().setColor(0xc58b45).setDescription(this.describeQueue(true));
    const files = [];
    const info = (this.current ?? this.idleCurrent)?.track.info;
    let artwork: string | undefined;
    if (info?.artworkUrl) {
      try {
        const url = new URL(info.artworkUrl);
        if (url.protocol === "https:" && !url.username && !url.password) artwork = url.href;
    } catch { /* Dev note: Bad album art does not cancel the concert. */ }
    }
    if (!artwork && info?.sourceName === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(info.identifier)) {
      artwork = `https://i.ytimg.com/vi/${info.identifier}/hqdefault.jpg`;
    }
    if (!artwork) {
      const filename = "music-now-playing.png";
      artwork = `attachment://${filename}`;
      files.push(createDuneBanner({ artwork: "music", filename, title: "Music Lounge", subtitle: "NOW PLAYING", detail: "THE SPICE MUST FLOW • SO MUST THE MUSIC" }));
    }
    if (artwork) embed.setImage(artwork);
    return { content: "", embeds: [embed], files, allowedMentions: { parse: [] as never[] } };
  }

  private announceTrack(id: string): void {
    if (this.stopped || !this.current || this.current.id !== id || this.lastAnnouncedId === id) return;
    this.lastAnnouncedId = id;
    this.refreshSongCard();
    const requester = this.current.requester;
    const message = this.nowPlayingMessage();
    message.embeds[0].setTitle("🎵 Your song is playing").setFooter({ text: "Use the music channel controls to manage your song." });
    const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
      .setStyle(ButtonStyle.Link).setLabel("Open Music Lounge")
      .setURL(`https://discord.com/channels/${this.config.guildId}/${this.config.requestChannelId}`))];
    void this.client.users.fetch(requester).then((user) => user.send({ ...message, components })).catch((error: unknown) => {
      // Dev note: A closed DM is not a request to stop the music.
      if (typeof error === "object" && error !== null && "code" in error && error.code === 50007) return;
      this.logger.warn("Could not deliver the song-start DM; playback is unaffected.");
    });
  }

  private refreshSongCard(): void {
    this.lastProgressCardAt = Date.now();
    this.announcements = this.announcements.then(async () => {
      if (this.stopped) return;
      const message = this.nowPlayingMessage();
      message.embeds[0].setTitle("🎵 Music Lounge").setFooter({ text: NOW_PLAYING_MARKER });
      if (this.current) message.embeds[0].addFields({ name: "Requested by", value: `<@${this.current.requester}>` });
      else if (this.idleCurrent) message.embeds[0].addFields({ name: "Player mode", value: "Waiting music • Requests take priority" });
      await this.nowPlayingPanel.update(message);
    }).catch(() => {
      this.logger.warn("Could not update the song card. Check Read Message History, Send Messages and Embed Links in the music request channel.");
    });
  }

  public errorMessage(error: unknown): string {
    if (error instanceof MusicUserError) return error.message;
    return "Music is temporarily unavailable. Check Lavalink, enabled audio sources, and the bot's voice permissions.";
  }

  private async ensurePlayer(): Promise<Player> {
    const interruptionVersion = this.interruptionVersion;
    if (Date.now() < this.retryAfter) throw new MusicUserError("Music is reconnecting. Retrying in a few seconds; your saved song and queue are preserved.");
    if (!this.backend.available()) throw new MusicUserError("Lavalink is reconnecting. Please try again shortly.");
    const guild = this.client.guilds.cache.get(this.config.guildId);
    if (!guild?.available) throw new MusicUserError("The music server is not available on this shard.");
    const channel = await guild.channels.fetch(this.config.voiceChannelId);
    if (channel?.type !== ChannelType.GuildVoice) throw new MusicUserError("The configured music voice channel is unavailable.");
    if (await this.client.voiceRooms?.isManagedChannel(guild.id, channel.id)) throw new MusicUserError("Music needs a permanent voice channel separate from join-to-create rooms.");
    const member = await guild.members.fetchMe();
    if (!channel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      throw new MusicUserError("The bot needs View Channel, Connect, and Speak in the music voice channel.");
    }
    let player = this.backend.player(guild.id);
    if (player && (this.resetConnection || member.voice.channelId !== channel.id)) {
      await this.backend.leave(guild.id);
      player = undefined;
    }
    if (!player) {
      player = await this.backend.join(guild.id, channel.id, guild.shardId);
      try {
        await player.setGlobalVolume(this.volume);
        if (this.current) await this.play(player, this.current);
      } catch (error) { this.resetConnection = true; throw error; }
    }
    if (interruptionVersion !== this.interruptionVersion) throw new MusicUserError("Playback was interrupted during recovery; the same song will be retried.");
    this.resetConnection = false;
    return player;
  }

  private activePosition(entry: QueueEntry): number {
    const player = this.backend.player(this.config.guildId);
    return player?.track === entry.track.encoded && Number.isFinite(player.position) ? Math.max(0, player.position) : this.current?.id === entry.id ? this.position : 0;
  }

  private async play(player: Player, entry: QueueEntry): Promise<void> {
    this.progress = { id: entry.id, position: this.position, at: Date.now() };
    const position = entry.track.info.isSeekable && !entry.track.info.isStream ? Math.min(this.position, Math.max(0, entry.track.info.length - 1)) : 0;
    try { await player.playTrack({ track: { encoded: entry.track.encoded, userData: { requestId: entry.id } }, position, paused: this.paused }); }
    catch (error) { this.interrupted(entry.id); throw error; }
  }

  private async advance(player: Player | undefined, stopCurrent = false): Promise<void> {
    const [entry, ...queue] = this.queue;
    await this.commit({ ...this.snapshot(), current: entry, queue, paused: false, position: 0 });
    this.idleCurrent = undefined;
    this.restoringId = undefined;
    this.pendingEnd = undefined;
    this.progress = undefined;
    if (!player) { this.interrupted(); return; }
    if (entry) await this.play(player, entry);
    else if (this.config.idlePlaylistUrl) await this.playNextIdle(player);
    else if (stopCurrent) {
      try { await player.stopTrack(); } catch (error) { this.resetConnection = true; throw error; }
    }
  }

  private async loadIdleTracks(): Promise<void> {
    if (!this.config.idlePlaylistUrl || this.idleTracks.length) return;
    if (!this.idleLoading) {
      this.idleLoading = (async () => {
        const tracks = loadedTracks(await this.backend.resolve(this.config.idlePlaylistUrl!));
        this.idleTracks = tracks.slice(0, 500);
        if (!this.idleTracks.length) throw new Error("The waiting-music playlist did not contain playable tracks.");
      })().finally(() => { this.idleLoading = undefined; });
    }
    await this.idleLoading;
  }

  private async playNextIdle(player: Player): Promise<void> {
    if (!this.config.idlePlaylistUrl || this.current || this.queue.length) return;
    await this.loadIdleTracks();
    const track = this.idleTracks[this.idleIndex % this.idleTracks.length];
    this.idleIndex = (this.idleIndex + 1) % this.idleTracks.length;
    const entry: QueueEntry = { id: `idle-${randomUUID()}`, track, requester: "waiting-music" };
    this.idleCurrent = entry;
    this.position = 0;
    try {
      await player.playTrack({ track: { encoded: track.encoded, userData: { requestId: entry.id } }, position: 0, paused: false });
      this.refreshSongCard();
    } catch (error) {
      this.idleCurrent = undefined;
      throw error;
    }
  }

  private interrupted(id?: string): void {
    if (this.stopped || (id && id !== this.current?.id && id !== this.idleCurrent?.id)) return;
    // Dev note: Two wrong notes do not make a retry timer right.
    // Dev note: Duplicate failures do not get extra sand in the retry glass.
    if (this.resetConnection && Date.now() < this.retryAfter) return;
    this.interruptionVersion++;
    // Dev note: Preserve the track position; walking without rhythm is discouraged.
    if (this.current) this.capturePosition();
    this.resetConnection = true;
    this.restoringId = this.current?.id;
    if (id === this.idleCurrent?.id || !this.current) this.idleCurrent = undefined;
    this.pendingEnd = undefined;
    this.progress = undefined;
    this.scheduleRecovery(true);
  }

  private finish(id?: string): void {
    if (!id || this.stopped) return;
    void this.serial(async () => {
      if (this.idleCurrent?.id === id && !this.current) {
        this.idleCurrent = undefined;
        const player = await this.ensurePlayer();
        await this.playNextIdle(player);
        return;
      }
      if (this.current?.id !== id) return;
      if (this.restoringId === id || !this.backend.available() || Date.now() < this.retryAfter) {
        this.resetConnection = true;
        this.scheduleRecovery(true);
        return;
      }
      this.pendingEnd = { id };
      const player = await this.ensurePlayer();
      await this.advance(player);
      if (!this.current) this.refreshSongCard();
      this.pendingEnd = undefined;
    }, true).catch(() => undefined);
  }

  private scheduleRecovery(failed = false): void {
    if (this.stopped || !this.started) return;
    clearTimeout(this.timer);
    if (failed) this.retryAfter = Date.now() + 10_000;
    const delay = this.retryAfter > Date.now() ? this.retryAfter - Date.now() : 30_000;
    this.timer = setTimeout(() => this.recover(), delay);
  }

  private recover(): void {
    if (!this.started || this.stopped || this.recovering || !this.client.guilds.cache.has(this.config.guildId)) return;
    if (!this.panel.ready) void this.panel.publish().then(() => this.refreshSongCard()).catch(() => {
      if (Date.now() - this.lastPanelWarning < 60_000) return;
      this.lastPanelWarning = Date.now();
      this.logger.warn("Music panel unavailable. Check View Channel, Send Messages, Read Message History, and Attach Files in the music request channel.");
    });
    if (Date.now() < this.retryAfter) return;
    clearTimeout(this.timer);
    if (!this.backend.available()) { this.scheduleRecovery(true); return; }
    this.recovering = true;
    let failed = false;
    void this.serial(async () => {
      const player = await this.ensurePlayer();
      if (this.pendingEnd?.id === this.current?.id && this.pendingEnd) {
        await this.advance(player);
        this.pendingEnd = undefined;
      } else if (!this.current && this.queue.length) await this.advance(player);
      else if (!this.current && !this.idleCurrent && this.config.idlePlaylistUrl) await this.playNextIdle(player);
    }, true).catch(() => { failed = true; }).finally(() => { this.recovering = false; this.scheduleRecovery(failed); });
  }
}
