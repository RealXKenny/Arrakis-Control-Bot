import { Events, Listener } from "@sapphire/framework";
import type { Message, PartialMessage } from "discord.js";
import { scopedLogger } from "../../client/logger";

/** A deleted question or answer is forgotten with it. */
class ChatbotMessageDelete extends Listener<typeof Events.MessageDelete> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.MessageDelete });
  }

  public override async run(message: Message | PartialMessage): Promise<void> {
    if (!message.guildId) return;
    try {
      await this.container.client.chatbot?.handleDeleted(message.guildId, [message.id]);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "CHATBOT").warn(`Unable to forget a deleted message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export { ChatbotMessageDelete };
