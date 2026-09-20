import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client } from "discord.js";
import { createDuneBanner } from "../../shared/discord/imageFactory";

export const MUSIC_BUTTON_ACTIONS = ["request", "now", "queue", "lyrics", "pause", "resume", "skip", "volume", "clear", "stop"] as const;

export function musicPanel(voiceChannelId: string) {
  const button = (action: typeof MUSIC_BUTTON_ACTIONS[number], label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`music:${action}`).setLabel(label).setStyle(style);
  const filename = "music-lounge.png";
  const panel = new ContainerBuilder().setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`).setDescription("Arrakis Control — Music Lounge")))
    .addTextDisplayComponents((text) => text.setContent(`## The soundtrack to your next expedition\nJoin <#${voiceChannelId}>, pick a song, and settle in. Request a track below or type a song name or supported link in this channel.`))
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent("### ✦ Find your next track\nSearch by song and artist, or paste a link. Searches queue the first result. The lounge is listen-only: your microphone is server-muted while you are here."))
    .addActionRowComponents((row) => row.addComponents(button("request", "🎵 Request Song", ButtonStyle.Primary), button("now", "🎧 Now Playing"), button("queue", "📜 View Queue"), button("lyrics", "View Lyrics")))
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent("### ✦ Take control\nPause for a moment, keep the music going, or move to the next request."))
    .addActionRowComponents((row) => row.addComponents(button("pause", "⏸ Pause"), button("resume", "▶ Resume", ButtonStyle.Success), button("skip", "⏭ Skip"), button("volume", "🔊 Volume")))
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent("### ✦ Manage the queue\nOwner role only: clear upcoming requests or stop playback. Both buttons ask for confirmation; the bot stays in voice."))
    .addActionRowComponents((row) => row.addComponents(button("clear", "Clear Queue"), button("stop", "Stop Playback", ButtonStyle.Danger)))
    .addTextDisplayComponents((text) => text.setContent("-# Everyone can view the queue. Listeners can request songs; skip, pause, resume and volume belong to the current requester. Clear Queue and Stop Playback require the configured Owner role. Playback controls require voice membership. Responses are private."));
  return { components: [panel], files: [createDuneBanner({ filename, title: "Music Lounge", subtitle: "ARRAKIS CONTROL", detail: "YOUR CREW. YOUR SOUNDTRACK." })],
    flags: MessageFlags.IsComponentsV2 as const, allowedMentions: { parse: [] as never[] } };
}

export class MusicPanelPublisher {
  private pending?: Promise<void>;
  public ready = false;
  public constructor(private readonly client: Client, private readonly channelId: string, private readonly voiceId: string) {}

  public publish(): Promise<void> {
    // Dev note: The panel leaves breadcrumbs so restarts do not redecorate the lounge.
    if (this.pending) return this.pending;
    this.pending = this.update().then(() => { this.ready = true; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async update(): Promise<void> {
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) throw new Error("Music panel requires a server text channel.");
    let before: string | undefined;
    // Dev note: One music panel is a feature; two is a duet nobody requested.
    for (let page = 0; page < 100; page++) {
      const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      const existing = messages.find((message) => message.author.id === this.client.user?.id &&
        message.components.some((component) => JSON.stringify(component.toJSON()).includes('"music:request"')));
      if (existing) {
        await existing.edit({ ...musicPanel(this.voiceId), attachments: [] });
        return;
      }
      if (messages.size < 100) {
        await channel.send(musicPanel(this.voiceId));
        return;
      }
      before = messages.last()!.id;
    }
    throw new Error("Music panel discovery exceeded its history limit; use a dedicated request channel.");
  }
}
