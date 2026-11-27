import { readFileSync } from "node:fs";
import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage, type Options } from "amqplib";
import type { ChatBridgeConfig } from "../config/chatBridge";
import { describeChatConnectionError } from "./chatConnectionError";

type Warn = (message: string) => void;

/**
 * `map` binds exact map keys on chat.map and can publish; `intercept` listens
 * to every key on the broker's chat.intercept feed and is receive-only.
 */
export type GameChatSubscription = { kind: "map"; maps: string[] } | { kind: "intercept" };

export class GameChatConnection {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private connecting?: Promise<void>;
  private stopped = true;
  private blocked = false;
  private backpressure = false;
  private delay = 1_000;
  private failures = 0;
  private lastFailure?: string;
  private readonly pending = new Map<string, (error?: Error) => void>();

  public constructor(
    private readonly config: ChatBridgeConfig,
    private readonly receive: (map: string, body: Buffer) => Promise<void>,
    private readonly warn: Warn,
    private readonly info: (message: string) => void = () => undefined,
    private readonly subscription: GameChatSubscription = { kind: "map", maps: [...new Set(config.routes.map((route) => route.map))] },
  ) {}

  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.launch();
  }

  private launch(): void {
    if (this.stopped || this.connecting) return;
    this.connecting = this.open().finally(() => {
      this.connecting = undefined;
      if (!this.channel) this.retry();
    });
  }

  private retry(): void {
    if (this.stopped || this.timer || this.connecting) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.launch(); }, this.delay);
    this.timer.unref();
    this.delay = Math.min(this.delay * 2, 30_000);
  }

  private async open(): Promise<void> {
    let connection: ChannelModel | undefined;
    let stage = "loading the CA certificate";
    try {
      const ca = this.config.caFile ? readFileSync(this.config.caFile) : undefined;
      stage = "connecting/authenticating";
      connection = await connect(this.config.url, {
        timeout: 10_000,
        rejectUnauthorized: true,
        ...(ca ? { ca: [ca] } : {}),
        ...(this.config.tlsServername ? { servername: this.config.tlsServername } : {}),
      });
      const current = connection;
      this.connection = current;
      this.blocked = false;
      this.backpressure = false;
      current.on("error", (error: unknown) => this.warn(`RabbitMQ connection error: ${describeChatConnectionError(error)}`));
      current.on("blocked", () => { this.blocked = true; });
      current.on("unblocked", () => { this.blocked = false; });
      current.on("close", () => {
        if (this.connection !== current) return;
        this.connection = undefined;
        this.channel = undefined;
        for (const finish of this.pending.values()) finish(new Error("RabbitMQ disconnected."));
        this.retry();
      });
      if (this.stopped) { await current.close(); return; }
      stage = "opening the AMQP channel";
      const channel = await current.createConfirmChannel();
      channel.on("error", (error: unknown) => this.warn(`RabbitMQ chat channel error while ${stage}: ${describeChatConnectionError(error)}`));
      channel.on("close", () => { void current.close().catch(() => undefined); });
      channel.on("return", (message: ConsumeMessage) => {
        this.pending.get(message.properties.messageId)?.(new Error("RabbitMQ returned an unroutable chat message."));
      });
      const exchange = this.subscription.kind === "intercept" ? "chat.intercept" : "chat.map";
      stage = `checking ${exchange}`;
      await channel.checkExchange(exchange);
      stage = "creating the chat receive queue";
      const queue = await channel.assertQueue("", { exclusive: true, autoDelete: true, durable: false, arguments: { "x-max-length": 500, "x-message-ttl": 60_000 } });
      if (this.subscription.kind === "intercept") {
        stage = "binding the chat.intercept feed";
        await channel.bindQueue(queue.queue, exchange, "#");
      } else {
        stage = "binding the map routes";
        for (const map of new Set(this.subscription.maps)) await channel.bindQueue(queue.queue, exchange, map);
      }
      await channel.prefetch(1);
      stage = "starting the chat consumer";
      await channel.consume(queue.queue, (message) => {
        if (!message) { void current.close().catch(() => undefined); return; }
        void this.receive(message.fields.routingKey, message.content)
          .then(() => { channel.ack(message); })
          .catch(() => {
            this.warn("Game chat could not be delivered to Discord; message discarded to avoid an endless retry loop.");
            try { channel.nack(message, false, false); } catch { /* Dev note: The connection left before signing the rejection slip. */ }
          });
      });
      if (this.stopped || this.connection !== current) { await current.close().catch(() => undefined); return; }
      this.channel = channel;
      this.delay = 1_000;
      stage = "relaying chat";
      const recovered = this.failures > 0 ? ` after ${this.failures} failed attempt(s)` : "";
      this.failures = 0;
      this.lastFailure = undefined;
      this.info(this.subscription.kind === "intercept"
        ? `RabbitMQ chat.intercept listener ready${recovered}; proximity chat is being watched.`
        : `RabbitMQ chat connection ready${recovered}; map routes are bound and the consumer is active.`);
    } catch (error: unknown) {
      this.reportFailure(`${stage}: ${describeChatConnectionError(error)}`);
      if (connection) await connection.close().catch(() => undefined);
      this.channel = undefined;
    }
  }

  /** Warns on the first failure and on a new reason; identical retries are summarized every tenth attempt. */
  private reportFailure(reason: string): void {
    this.failures += 1;
    const repeated = reason === this.lastFailure;
    this.lastFailure = reason;
    // Dev note: The broker heard us the first time; there is no need to knock ten times in a row.
    if (!repeated) {
      this.warn(`RabbitMQ chat unavailable while ${reason} Retrying automatically; identical retries are summarized.`);
      return;
    }
    if (this.failures % 10 === 0) this.warn(`RabbitMQ chat still unavailable after ${this.failures} attempts while ${reason}`);
  }

  public publish(map: string, id: string, body: Buffer): Promise<void> {
    if (this.subscription.kind !== "map") return Promise.reject(new Error("The chat.intercept listener is receive-only."));
    const properties: Options.Publish = {
      // Dev note: AMQP calls this a type; HTTP's MIME department is not invited.
      contentType: "Content", type: "text_chat", appId: "fls_backend",
      headers: { redirect_exchange: Buffer.from("chat.map") },
      userId: this.config.username, messageId: id, mandatory: true, expiration: "60000",
    };
    const channel = this.channel;
    if (!channel || this.stopped || this.blocked || this.backpressure || this.pending.size >= 50) {
      return Promise.reject(new Error("Chat bridge is offline or busy."));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Game chat confirmation timed out; delivery is unknown.")), 10_000);
      const finish = (error?: Error): void => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      this.pending.set(id, finish);
      try {
        const writable = channel.publish("chat.map", map, body, properties, (error: unknown) => finish(error ? new Error("Game chat publish rejected.") : undefined));
        if (!writable) {
          this.backpressure = true;
          channel.once("drain", () => { if (this.channel === channel) this.backpressure = false; });
        }
      } catch { finish(new Error("Game chat publish failed.")); }
    });
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const finish of this.pending.values()) finish(new Error("Chat bridge stopped."));
    if (this.connection) await this.connection.close().catch(() => undefined);
    await this.connecting;
    this.channel = undefined;
  }
}
