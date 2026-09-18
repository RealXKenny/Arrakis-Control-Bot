import { Events, Listener, ApplicationCommandRegistries } from "@sapphire/framework";
import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { cleanupLegacyCommands } from "../../support/commands/cleanupLegacyCommands";

export class CommandCleanup extends Listener<typeof Events.ApplicationCommandRegistriesBulkOverwrite> {
  private running = false;
  public constructor(context: Listener.LoaderContext) { super(context, { event: Events.ApplicationCommandRegistriesBulkOverwrite }); }
  public override async run(_commands: unknown, guildId: string | null): Promise<void> {
    if (!isPrimaryShard() || guildId !== null || this.running || ApplicationCommandRegistries.getDefaultGuildIds()?.length) return;
    this.running = true;
    try {
      await cleanupLegacyCommands(this.container.client, new Set(this.container.client.stores.get("commands").keys()));
    } catch {
      this.container.logger.warn("[COMMANDS] Could not finish old-command cleanup; startup will retry next time.");
    } finally { this.running = false; }
  }
}
