import { Events, escapeMarkdown, type Client, type Message } from "discord.js";
import type { ChatBridgeConfig } from "../../infrastructure/config/chatBridge";
import { GameChatConnection } from "../../infrastructure/amqp/GameChatConnection";
import { decodeGameChat, encodeMapChat, isProximityChannelType, peekChatChannelType, type GameChatMessage } from "./gameChatProtocol";
import { mapChatLabel } from "./mapChatLabel";

const MAP_KEY = /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;

export class DiscordGameChatBridge {
  private connection?: GameChatConnection;
  private interceptConnection?: GameChatConnection;
  private readonly typesSeen = new Set<string>();
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
    if (this.connection || this.interceptConnection) return;
    // Dev note: Only the shard holding the map gets to lead the caravan.
    const routes = this.config.routes.filter((route) => this.client.guilds.cache.has(route.guildId));
    const proximity = this.config.proximity;
    const proximityRoutes = (proximity?.routes ?? []).filter((route) => this.client.guilds.cache.has(route.guildId));
    if (!routes.length && !proximityRoutes.length) {
      this.info("Chat bridge inactive on this shard: no configured guilds are present.");
      return;
    }
    this.info(`${new Set(routes.map((route) => route.map)).size} map(s) linked across ${new Set(routes.map((route) => route.channelId)).size} Discord channel(s).`);
    this.info(this.config.displayName ? "Chat bridge uses an explicit game display name; native player-name lookup is disabled in the payload." : "Chat bridge uses native game player-name lookup.");
    if (proximity) {
      const where = proximityRoutes.length ? `${new Set(proximityRoutes.map((route) => route.channelId)).size} dedicated Discord channel(s)` : "each map's bridge channel";
      this.info(`Proximity chat relay is on (receive-only) and posts to ${where}${proximity.intercept ? "; also listening on chat.intercept" : ""}.`);
    }
    const maps = [...new Set([...routes.map((route) => route.map), ...proximityRoutes.flatMap((route) => route.map ? [route.map] : [])])];
    if (maps.length) {
      this.connection = new GameChatConnection({ ...this.config, routes }, (map, body) => this.sendToDiscord(map, body), this.warn, this.info, { kind: "map", maps });
      this.connection.start();
    }
    if (proximity?.intercept) {
      // Dev note: A refused intercept listener must never take map chat down with it.
      this.interceptConnection = new GameChatConnection(this.config, (key, body) => this.sendInterceptToDiscord(key, body), this.warn, this.info, { kind: "intercept" });
      this.interceptConnection.start();
    }
    this.client.on(Events.MessageCreate, this.onMessage);
  }

  public async stop(): Promise<void> {
    this.client.off(Events.MessageCreate, this.onMessage);
    await Promise.all([this.connection?.stop(), this.interceptConnection?.stop()]);
    this.connection = undefined;
    this.interceptConnection = undefined;
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
      // Dev note: Prescience is unavailable, so each map gets an independent ID.
      // Dev note: Visit every route once; uncertain deliveries get no time-travel retries.
      for (const route of routes) {
        const encoded = encodeMapChat(this.config.funcomId, text, this.config.displayName);
        try {
          await this.connection.publish(route.map, encoded.id, encoded.body);
        } catch {
          failedMaps.push(route.map);
        }
      }
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

  /** Handles a message from the chat.map consumer: map chat, plus proximity chat when it is enabled. */
  public async sendToDiscord(map: string, body: Buffer): Promise<void> {
    this.noteChannelType("chat.map", map, body);
    const chat = decodeGameChat(body, Boolean(this.config.proximity));
    if (!chat || chat.sender === this.config.funcomId) return;
    if (isProximityChannelType(chat.channelType)) return this.sendProximity(map, chat);
    const routes = this.config.routes.filter((route) => route.map === map && this.client.guilds.cache.has(route.guildId));
    await this.deliver(routes, mapChatLabel(map), map, chat);
  }

  /** Handles a message from the chat.intercept listener: only proximity chat is relayed, the map consumer covers map chat. */
  public async sendInterceptToDiscord(routingKey: string, body: Buffer): Promise<void> {
    this.noteChannelType("chat.intercept", routingKey, body);
    if (!this.config.proximity) return;
    const chat = decodeGameChat(body, true);
    if (!chat || chat.sender === this.config.funcomId || !isProximityChannelType(chat.channelType)) return;
    await this.sendProximity(MAP_KEY.test(routingKey) ? routingKey : undefined, chat);
  }

  private async sendProximity(map: string | undefined, chat: GameChatMessage): Promise<void> {
    const proximity = this.config.proximity;
    if (!proximity) return;
    const present = (route: { guildId: string }): boolean => this.client.guilds.cache.has(route.guildId);
    const dedicated = proximity.routes.filter(present);
    const destinations = proximity.routes.length
      ? dedicated.filter((route) => !route.map || route.map === map)
      : this.config.routes.filter((route) => present(route) && (!map || route.map === map));
    const unique = [...new Map(destinations.map((route) => [route.channelId, route])).values()];
    const label = map ? `${mapChatLabel(map)} · Proximity` : "Proximity";
    // Dev note: One dedupe scope for both feeds, so a message heard twice is told once.
    await this.deliver(unique, label, "proximity", chat);
  }

  private noteChannelType(source: string, key: string, body: Buffer): void {
    const type = peekChatChannelType(body);
    if (!type || this.typesSeen.size >= 50) return;
    const seenKey = `${source}:${type}`;
    if (this.typesSeen.has(seenKey)) return;
    this.typesSeen.add(seenKey);
    // Dev note: Name the kind of chat, never what was said in it.
    const where = MAP_KEY.test(key) ? ` (${mapChatLabel(key)})` : "";
    this.info(`Chat bridge first saw "${type}" chat on ${source}${where}.`);
  }

  private async deliver(routes: { guildId: string; channelId: string }[], label: string, scope: string, chat: GameChatMessage): Promise<void> {
    let playerName: string | undefined;
    let deliveryFailed = false;
    for (const route of routes) {
      const key = `${route.channelId}:${scope}:${chat.id}`;
      if (this.seen.has(key) || this.inFlight.has(key)) continue;
      this.inFlight.add(key);
      try {
        playerName ??= await this.resolvePlayerName(chat.sender).catch(() => chat.sender);
        const channel = await this.client.channels.fetch(route.channelId);
        if (!channel?.isSendable() || !("guildId" in channel) || channel.guildId !== route.guildId) throw new Error("Invalid chat destination.");
        const prefix = `**[${escapeMarkdown(label)}] ${escapeMarkdown(playerName.slice(0, 100))}:** `;
        const content = prefix + escapeMarkdown(chat.text);
        // Dev note: The water discipline also applies to message length.
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
