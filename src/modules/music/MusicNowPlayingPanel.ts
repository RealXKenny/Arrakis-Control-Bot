import type { Client, MessageCreateOptions } from "discord.js";
import { publishPersistentPanel } from "../panels/persistentPanel";

export const NOW_PLAYING_MARKER = "Arrakis Control • Now Playing";
export class MusicNowPlayingPanel {
  public constructor(private readonly client: Client, private readonly channelId: string) {}

  public async update(payload: MessageCreateOptions): Promise<void> {
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel?.isSendable() || channel.isDMBased()) throw new Error("Music channel unavailable.");
    await publishPersistentPanel(this.client, channel, "music-now-playing", {
      matches: (message) => message.embeds.some((embed) => embed.footer?.text === NOW_PLAYING_MARKER ||
        (embed.title === "🎵 Music Lounge" && embed.footer?.text === "Track-start snapshot • Use the music control panel for live details")),
      payload,
      keepOldest: true,
      removeDuplicates: true,
    });
  }
}
