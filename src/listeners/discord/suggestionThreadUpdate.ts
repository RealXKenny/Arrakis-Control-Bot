import { Events, Listener } from "@sapphire/framework";
import type { AnyThreadChannel } from "discord.js";
import { scopedLogger } from "../../client/logger";

class SuggestionThreadUpdate extends Listener<typeof Events.ThreadUpdate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ThreadUpdate });
  }

  public override async run(_previous: AnyThreadChannel, thread: AnyThreadChannel): Promise<void> {
    try {
      await this.container.client.suggestions?.handleThreadUpdate(thread);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "SUGGESTIONS").error("Unable to sync an edited suggestion post.", error);
    }
  }
}

export { SuggestionThreadUpdate };
