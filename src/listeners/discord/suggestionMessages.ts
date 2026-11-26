import { Events, Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { scopedLogger } from "../../client/logger";

class SuggestionMessages extends Listener<typeof Events.MessageCreate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.MessageCreate });
  }

  public override async run(message: Message): Promise<void> {
    try {
      await this.container.client.suggestions?.handleMessage(message);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "SUGGESTIONS").error("Unable to summarize a suggestion discussion.", error);
    }
  }
}

export { SuggestionMessages };
