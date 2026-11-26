import { Events, Listener } from "@sapphire/framework";
import { isPrimaryShard } from "../../shared/process/shardIdentity";
import { preserveEntryPointCommand } from "../../support/commands/preserveEntryPointCommand";

/** Runs synchronously before Sapphire's global bulk overwrite so the Activity entry point is kept. */
export class EntryPointGuard extends Listener<typeof Events.ApplicationCommandRegistriesInitialising> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ApplicationCommandRegistriesInitialising });
  }

  public override run(): void {
    const commands = this.container.client.application?.commands;
    if (!isPrimaryShard() || !commands) return;
    preserveEntryPointCommand(commands);
  }
}
