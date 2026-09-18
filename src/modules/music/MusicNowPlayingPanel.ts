import type { Client, Message, MessageCreateOptions } from "discord.js";

export const NOW_PLAYING_MARKER = "Arrakis Control • Now Playing";
export class MusicNowPlayingPanel {
  private message?: Message;
  public constructor(private readonly client: Client, private readonly channelId: string) {}

  public async update(payload: MessageCreateOptions): Promise<void> {
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel?.isSendable() || channel.isDMBased()) throw new Error("Music channel unavailable.");
    if (!this.message) {
      const cards: Message[] = [];
      let before: string | undefined;
      for (let page = 0; ; page++) {
        if (page === 100) throw new Error("Music cleanup history limit reached.");
        const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        cards.push(...messages.filter((message) => message.author.id === this.client.user?.id && message.embeds.some((embed) =>
          embed.footer?.text === NOW_PLAYING_MARKER || (embed.title === "🎵 Music Lounge" && embed.footer?.text === "Track-start snapshot • Use the music control panel for live details"))).values());
        if (messages.size < 100) break;
        before = messages.last()!.id;
      }
      // Keep the oldest card close to the original controls, and remove only our identified song cards.
      const existing = cards.pop();
      for (const duplicate of cards) await duplicate.delete();
      this.message = existing;
    }
    if (this.message) {
      try {
        await this.message.edit({ content: payload.content ?? "", embeds: payload.embeds, allowedMentions: { parse: [] } });
        return;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 10008)) throw error;
        this.message = undefined;
      }
    }
    this.message = await channel.send(payload);
  }
}
