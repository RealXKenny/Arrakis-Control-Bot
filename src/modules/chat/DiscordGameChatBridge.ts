import { Events, escapeMarkdown, type Client, type Message } from "discord.js";
import type { ChatBridgeConfig } from "../../infrastructure/config/chatBridge";
import { GameChatConnection } from "../../infrastructure/amqp/GameChatConnection";
import { decodeMapChat, encodeMapChat } from "./gameChatProtocol";
import { mapChatLabel } from "./mapChatLabel";

export class DiscordGameChatBridge {
  private connection?: GameChatConnection;
  private readonly seen = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly onMessage = (message: Message): void => {
    void this.sendToGame(message).catch(() => this.warn("Unexpected Discord chat relay failure."));
  };

  public constructor(
    private readonly client: Client,
    private readonly config: ChatBridgeConfig,
    private readonly warn: (message: string) => void,
    private readonly info: (message: string) => void = () => undefined,
    private readonly ownerRoleId?: string,
    private readonly resolvePlayerName: (sender: string) => Promise<string> = (sender) => Promise.resolve(sender),
  ) {}

  public start(): void {
    if (this.connection) return;
    // Only the shard that owns the configured guild consumes its routes.
    const routes = this.config.routes.filter((route) => this.client.guilds.cache.has(route.guildId));
    if (!routes.length) {
      this.info("Chat bridge inactive on this shard: no configured guilds are present.");
      return;
    }
    for (const route of routes) this.info(`Chat bridge route: Discord channel ${route.channelId} -> chat.map/${route.map}.`);
    this.info(this.config.displayName ? "Chat bridge uses an explicit game display name; native player-name lookup is disabled in the payload." : "Chat bridge uses native game player-name lookup.");
    this.connection = new GameChatConnection({ ...this.config, routes }, (map, body) => this.sendToDiscord(map, body), this.warn, this.info);
    this.connection.start();
    this.client.on(Events.MessageCreate, this.onMessage);
  }

  public async stop(): Promise<void> {
    this.client.off(Events.MessageCreate, this.onMessage);
    await this.connection?.stop();
    this.connection = undefined;
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
        const destinations = failedMaps.map(mapChatLabel).join(", ");
        const summary = destinations.length > 1_600 ? destinations.slice(0, 1_599) + "…" : destinations;
        await message.reply({ content: `Delivery could not be confirmed for: ${summary}. Other mapped destinations may have received it. Messages are not automatically resent.`, allowedMentions: { parse: [], repliedUser: false } }).catch(() => undefined);
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
    let playerName: string | undefined;
    let deliveryFailed = false;
    for (const route of routes) {
      const key = `${route.channelId}:${map}:${chat.id}`;
      if (this.seen.has(key) || this.inFlight.has(key)) continue;
      this.inFlight.add(key);
      try {
        playerName ??= await this.resolvePlayerName(chat.sender).catch(() => chat.sender);
        const channel = await this.client.channels.fetch(route.channelId);
        if (!channel?.isSendable() || !("guildId" in channel) || channel.guildId !== route.guildId) throw new Error("Invalid chat destination.");
        const prefix = `**[${escapeMarkdown(mapChatLabel(map))}] ${escapeMarkdown(playerName.slice(0, 100))}:** `;
        const content = prefix + escapeMarkdown(chat.text);
        // Bounded output prevents one game message from flooding Discord.
        await channel.send({ content: content.length > 2_000 ? content.slice(0, 1_999) + "…" : content, allowedMentions: { parse: [] } });
        this.seen.add(key);
        if (this.seen.size > 5_000) this.seen.delete(this.seen.values().next().value!);
      } catch {
        deliveryFailed = true;
        this.warn(`Unable to relay game chat to Discord channel ${route.channelId}. Check channel access and send permissions.`);
      } finally {
        this.inFlight.delete(key);
      }
    }
    if (deliveryFailed) throw new Error("One or more Discord chat destinations failed.");
  }
}
