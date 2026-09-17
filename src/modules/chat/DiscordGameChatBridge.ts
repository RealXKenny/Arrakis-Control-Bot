import { Events, escapeMarkdown, type Client, type Message } from "discord.js";
import type { ChatBridgeConfig } from "../../infrastructure/config/chatBridge";
import { GameChatConnection } from "../../infrastructure/amqp/GameChatConnection";
import { decodeMapChat, decodeProximityChat, encodeMapChat } from "./gameChatProtocol";

export class DiscordGameChatBridge {
  private connection?: GameChatConnection;
  private proximityConnection?: GameChatConnection;
  private readonly seen = new Set<string>();
  private readonly onMessage = (message: Message): void => { void this.sendToGame(message); };

  public constructor(
    private readonly client: Client,
    private readonly config: ChatBridgeConfig,
    private readonly warn: (message: string) => void,
    private readonly info: (message: string) => void = () => undefined,
    private readonly ownerRoleId?: string,
  ) {}

  public start(): void {
    if (this.connection || this.proximityConnection) return;
    // Only the shard that owns the configured guild consumes its routes.
    const routes = this.config.routes.filter((route) => this.client.guilds.cache.has(route.guildId));
    const proximityRoutes = (this.config.proximityRoutes ?? []).filter((route) => this.client.guilds.cache.has(route.guildId));
    if (!routes.length && !proximityRoutes.length) {
      this.info("Chat bridge inactive on this shard: no configured guilds are present.");
      return;
    }
    for (const route of routes) this.info(`Chat bridge route: Discord channel ${route.channelId} -> chat.map/${route.map}.`);
    this.info(this.config.displayName ? "Chat bridge uses an explicit game display name; native player-name lookup is disabled in the payload." : "Chat bridge uses native game player-name lookup.");
    if (routes.length) {
      this.connection = new GameChatConnection({ ...this.config, routes }, (map, body) => this.sendToDiscord(map, body), this.warn, this.info);
      this.connection.start();
    }
    if (proximityRoutes.length) {
      this.info(`Chat bridge proximity destinations: ${proximityRoutes.map((route) => route.channelId).join(", ")}; receive-only, server-wide.`);
      // A denied intercept subscription must not interrupt working map chat.
      this.proximityConnection = new GameChatConnection(this.config, (_key, body) => this.sendProximityToDiscord(body), this.warn, this.info, "proximity");
      this.proximityConnection.start();
    }
    this.client.on(Events.MessageCreate, this.onMessage);
  }

  public async stop(): Promise<void> {
    this.client.off(Events.MessageCreate, this.onMessage);
    await Promise.all([this.connection?.stop(), this.proximityConnection?.stop()]);
    this.connection = undefined;
    this.proximityConnection = undefined;
  }

  public async sendToGame(message: Message): Promise<void> {
    if (!message.guildId || message.author.bot || message.webhookId || message.system) return;
    const routes = this.config.routes.filter((entry) => entry.channelId === message.channelId && entry.guildId === message.guildId);
    if (!routes.length) return;
    if (!message.content.trim()) {
      this.info(`Chat bridge skipped Discord message ${message.id}: no text content was available.`);
      return;
    }
    const author = (message.member?.displayName ?? message.author.username).replace(/[\r\n]/g, " ").slice(0, 80);
    const ownerTag = this.ownerRoleId && message.member?.roles.cache.has(this.ownerRoleId) ? "[Owner] " : "";
    const text = `[Discord] ${ownerTag}${author}: ${message.cleanContent || message.content}`;
    try {
      if (text.length > 2_000) throw new Error("Message too long.");
      if (!this.connection) throw new Error("Chat bridge offline.");
      const failedMaps: string[] = [];
      // Separate IDs keep each map's confirmation independent. Attempt every route,
      // including when an earlier publish fails; never retry uncertain deliveries.
      for (const route of routes) {
        const encoded = encodeMapChat(this.config.funcomId, text, this.config.displayName);
        try {
          await this.connection.publish(route.map, encoded.id, encoded.body);
        } catch {
          failedMaps.push(route.map);
        }
      }
      this.info(`Chat bridge Discord message ${message.id}: RabbitMQ accepted ${routes.length - failedMaps.length}/${routes.length} map publishes.`);
      if (failedMaps.length) {
        this.warn(`Chat bridge delivery unconfirmed for maps: ${failedMaps.join(", ")}.`);
        await message.reply({ content: `Delivery could not be confirmed for: ${failedMaps.join(", ")}. Other mapped destinations may have received it. Messages are not automatically resent.`, allowedMentions: { parse: [], repliedUser: false } }).catch(() => undefined);
      }
    } catch {
      this.warn("Discord chat relay failed or delivery is unconfirmed.");
      await message.reply({ content: "I couldn't confirm delivery to the game (the bridge may be offline/busy, or the message too long). Messages are not automatically resent.", allowedMentions: { parse: [], repliedUser: false } }).catch(() => undefined);
    }
  }

  public async sendToDiscord(map: string, body: Buffer): Promise<void> {
    const chat = decodeMapChat(body);
    if (!chat || chat.sender === this.config.funcomId) return;
    const routes = this.config.routes.filter((route) => route.map === map && this.client.guilds.cache.has(route.guildId));
    await this.deliverToDiscord(map, chat, routes);
  }

  public async sendProximityToDiscord(body: Buffer): Promise<void> {
    // The intercept feed can include private traffic: reject everything except
    // explicit Proximity messages before delivery or logging.
    const chat = decodeProximityChat(body);
    if (!chat || chat.sender === this.config.funcomId) return;
    const routes = (this.config.proximityRoutes ?? []).filter((route) => this.client.guilds.cache.has(route.guildId));
    await this.deliverToDiscord("Proximity", chat, routes);
  }

  private async deliverToDiscord(map: string, chat: { id: string; sender: string; text: string }, routes: { guildId: string; channelId: string }[]): Promise<void> {
    for (const route of routes) {
      const key = `${route.channelId}:${map}:${chat.id}`;
      if (this.seen.has(key)) continue;
      const channel = await this.client.channels.fetch(route.channelId);
      if (!channel?.isSendable() || !("guildId" in channel) || channel.guildId !== route.guildId) throw new Error("Invalid chat destination.");
      const prefix = `**[${escapeMarkdown(map)}] ${escapeMarkdown(chat.sender.slice(0, 100))}:** `;
      const content = prefix + escapeMarkdown(chat.text);
      // Bounded output prevents one game message from flooding Discord.
      await channel.send({ content: content.length > 2_000 ? content.slice(0, 1_999) + "…" : content, allowedMentions: { parse: [] } });
      this.seen.add(key);
      if (this.seen.size > 5_000) this.seen.delete(this.seen.values().next().value!);
    }
  }
}
