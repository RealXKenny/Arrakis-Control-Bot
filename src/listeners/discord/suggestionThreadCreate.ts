import { Events, Listener } from "@sapphire/framework";
import type { AnyThreadChannel } from "discord.js";
import { scopedLogger } from "../../client/logger";

class SuggestionThreadCreate extends Listener<typeof Events.ThreadCreate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ThreadCreate });
  }

  public override async run(thread: AnyThreadChannel, newlyCreated: boolean): Promise<void> {
    try {
      await this.container.client.suggestions?.handleThreadCreate(thread, newlyCreated);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "SUGGESTIONS").error("Unable to process a new suggestion post.", error);
    }
  }
}

export { SuggestionThreadCreate };
