import { Events, Listener } from "@sapphire/framework";
import type { Message, PartialMessage } from "discord.js";
import { scopedLogger } from "../../client/logger";

class MessageArchiveUpdate extends Listener<typeof Events.MessageUpdate> {
  public constructor(context: Listener.LoaderContext) { super(context, { event: Events.MessageUpdate }); }
  public override async run(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
    try {
      await this.container.client.messageArchive?.edited(oldMessage, newMessage);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "MESSAGE ARCHIVE").error("Unable to archive a Discord message edit.", error);
    }
  }
}

export { MessageArchiveUpdate };
