import { Events, Listener } from "@sapphire/framework";
import { scopedLogger } from "../../client/logger";
import { ShardReconnectTracker } from "../../shared/discord/shardReconnectTracker";

const reconnects = new ShardReconnectTracker();

class ClientError extends Listener<typeof Events.Error> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.Error, name: "ClientError" });
  }
  public override run(error: Error): void {
    scopedLogger(this.container.logger, "GATEWAY").error("Discord client error.", error);
  }
}

class ClientWarn extends Listener<typeof Events.Warn> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.Warn, name: "ClientWarn" });
  }
  public override run(message: string): void {
    scopedLogger(this.container.logger, "GATEWAY").warn(`Discord client warning: ${message}`);
  }
}

class ShardError extends Listener<typeof Events.ShardError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardError, name: "ShardError" });
  }
  public override run(error: Error): void {
    scopedLogger(this.container.logger, "GATEWAY").error("Discord gateway shard error.", error);
  }
}

class ShardDisconnect extends Listener<typeof Events.ShardDisconnect> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardDisconnect, name: "ShardDisconnect" });
  }
  public override run(event: CloseEvent, shardId: number): void {
    reconnects.disconnected(shardId, event.code);
  }
}

class ShardReconnecting extends Listener<typeof Events.ShardReconnecting> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardReconnecting, name: "ShardReconnecting" });
  }
  public override run(shardId: number): void {
    const attempt = reconnects.reconnecting(shardId);
    if (!attempt.shouldWarn) return;
    const closeCode = attempt.closeCode === undefined ? "unknown" : String(attempt.closeCode);
    scopedLogger(this.container.logger, "GATEWAY").warn(`Discord shard ${shardId} exceeded five consecutive reconnect attempts (attempt ${attempt.attempts}, last close code ${closeCode}).`);
  }
}

class ShardResume extends Listener<typeof Events.ShardResume> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardResume, name: "ShardResume" });
  }
  public override run(shardId: number, replayedEvents: number): void {
    reportRecovery(this.container.logger, shardId, `resumed with ${replayedEvents ?? 0} events replayed`);
  }
}

class ShardReady extends Listener<typeof Events.ShardReady> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ShardReady, name: "ShardReady" });
  }
  public override run(shardId: number): void {
    reportRecovery(this.container.logger, shardId, "started a fresh gateway session");
  }
}

class Invalidated extends Listener<typeof Events.Invalidated> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.Invalidated, name: "Invalidated" });
  }
  public override run(): void {
    scopedLogger(this.container.logger, "GATEWAY").error("Discord invalidated the session; a restart may be required.");
  }
}

function reportRecovery(logger: ShardResume["container"]["logger"], shardId: number, result: string): void {
  const recovery = reconnects.recovered(shardId);
  if (!recovery.shouldReport) return;
  scopedLogger(logger, "GATEWAY").info(`Discord shard ${shardId} recovered after ${recovery.attempts} reconnect attempts and ${result}.`);
}

export { ClientError, ClientWarn, Invalidated, ShardDisconnect, ShardError, ShardReady, ShardReconnecting, ShardResume };
