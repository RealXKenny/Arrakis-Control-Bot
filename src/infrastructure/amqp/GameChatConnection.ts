import { readFileSync } from "node:fs";
import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage, type Options } from "amqplib";
import type { ChatBridgeConfig } from "../config/chatBridge";
import { describeChatConnectionError } from "./chatConnectionError";

type Warn = (message: string) => void;

export class GameChatConnection {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private connecting?: Promise<void>;
  private stopped = true;
  private blocked = false;
  private backpressure = false;
  private delay = 1_000;
  private readonly pending = new Map<string, (error?: Error) => void>();

  public constructor(
    private readonly config: ChatBridgeConfig,
    private readonly receive: (map: string, body: Buffer) => Promise<void>,
    private readonly warn: Warn,
    private readonly info: (message: string) => void = () => undefined,
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
      stage = "checking chat.map";
      await channel.checkExchange("chat.map");
      stage = "creating the chat receive queue";
      const queue = await channel.assertQueue("", { exclusive: true, autoDelete: true, durable: false, arguments: { "x-max-length": 500, "x-message-ttl": 60_000 } });
      stage = "binding the map routes";
      for (const map of new Set(this.config.routes.map((route) => route.map))) await channel.bindQueue(queue.queue, "chat.map", map);
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
      this.info("RabbitMQ chat connection ready; map routes are bound and the consumer is active.");
    } catch (error: unknown) {
      this.warn(`RabbitMQ chat unavailable while ${stage}: ${describeChatConnectionError(error)} Retrying automatically.`);
      if (connection) await connection.close().catch(() => undefined);
      this.channel = undefined;
    }
  }

  public publish(map: string, id: string, body: Buffer): Promise<void> {
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
