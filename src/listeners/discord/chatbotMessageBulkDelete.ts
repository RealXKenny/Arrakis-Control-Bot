import { Events, Listener } from "@sapphire/framework";
import type { Message, PartialMessage, ReadonlyCollection, Snowflake } from "discord.js";
import { scopedLogger } from "../../client/logger";

/** Bulk-deleted (purged) questions and answers are forgotten with them. */
class ChatbotMessageBulkDelete extends Listener<typeof Events.MessageBulkDelete> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.MessageBulkDelete });
  }

  public override async run(messages: ReadonlyCollection<Snowflake, Message<true> | PartialMessage<true>>): Promise<void> {
    const guildId = messages.first()?.guildId;
    if (!guildId) return;
    try {
      await this.container.client.chatbot?.handleDeleted(guildId, [...messages.keys()]);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "CHATBOT").warn(`Unable to forget deleted messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export { ChatbotMessageBulkDelete };
