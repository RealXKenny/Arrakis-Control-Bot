import { Events, Listener } from "@sapphire/framework";
import type { Message, PartialMessage, ReadonlyCollection, Snowflake } from "discord.js";
import { scopedLogger } from "../../client/logger";

class MessageArchiveBulkDelete extends Listener<typeof Events.MessageBulkDelete> {
  public constructor(context: Listener.LoaderContext) { super(context, { event: Events.MessageBulkDelete }); }
  public override async run(messages: ReadonlyCollection<Snowflake, Message<true> | PartialMessage<true>>): Promise<void> {
    try {
      await this.container.client.messageArchive?.bulkDeleted(messages);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "MESSAGE ARCHIVE").error("Unable to archive bulk-deleted Discord messages.", error);
    }
  }
}

export { MessageArchiveBulkDelete };
