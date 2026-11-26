import { Events, Listener } from "@sapphire/framework";
import type { AnyThreadChannel } from "discord.js";
import { scopedLogger } from "../../client/logger";

class SuggestionThreadDelete extends Listener<typeof Events.ThreadDelete> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ThreadDelete });
  }

  public override async run(thread: AnyThreadChannel): Promise<void> {
    try {
      await this.container.client.suggestions?.handleThreadDelete(thread);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "SUGGESTIONS").error("Unable to remove a deleted suggestion post.", error);
    }
  }
}

export { SuggestionThreadDelete };
