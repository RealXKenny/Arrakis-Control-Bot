import { Events, Listener } from "@sapphire/framework";

class ClientError extends Listener<typeof Events.Error> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.Error, name: "ClientError" });
  }
  public override run(error: Error): void {
    this.container.logger.error("Discord client error.", error);
  }
}

class ClientWarn extends Listener<typeof Events.Warn> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.Warn, name: "ClientWarn" });
  }
  public override run(message: string): void {
    this.container.logger.warn(`Discord client warning: ${message}`);
  }
}

class ShardError extends Listener<typeof Events.ShardError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardError, name: "ShardError" });
  }
  public override run(error: Error): void {
    this.container.logger.error("Discord gateway shard error.", error);
  }
}

class ShardDisconnect extends Listener<typeof Events.ShardDisconnect> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardDisconnect, name: "ShardDisconnect" });
  }
  public override run(event: CloseEvent, shardId: number): void {
    this.container.logger.warn(`Discord shard ${shardId} disconnected (code ${event.code}). Discord.js will reconnect automatically.`);
  }
}

class ShardReconnecting extends Listener<typeof Events.ShardReconnecting> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardReconnecting, name: "ShardReconnecting" });
  }
  public override run(shardId: number): void {
    this.container.logger.warn(`Discord shard ${shardId ?? "unknown"} is reconnecting.`);
  }
}

class ShardResume extends Listener<typeof Events.ShardResume> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardResume, name: "ShardResume" });
  }
  public override run(shardId: number, replayedEvents: number): void {
    this.container.logger.info(`Discord shard ${shardId ?? "unknown"} resumed after a connection hiccup (${replayedEvents ?? 0} events replayed).`);
  }
}

class Invalidated extends Listener<typeof Events.Invalidated> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.Invalidated, name: "Invalidated" });
  }
  public override run(): void {
    this.container.logger.error("Discord invalidated the session; a restart may be required.");
  }
}

export { ClientError, ClientWarn, Invalidated, ShardDisconnect, ShardError, ShardReconnecting, ShardResume };
