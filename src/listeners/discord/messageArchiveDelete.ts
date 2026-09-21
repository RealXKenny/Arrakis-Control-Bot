import { Events, Listener } from "@sapphire/framework";
import type { Message, PartialMessage } from "discord.js";
import { scopedLogger } from "../../client/logger";

class MessageArchiveDelete extends Listener<typeof Events.MessageDelete> {
  public constructor(context: Listener.LoaderContext) { super(context, { event: Events.MessageDelete }); }
  public override async run(message: Message | PartialMessage): Promise<void> {
    try {
      await this.container.client.messageArchive?.deleted(message);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "MESSAGE ARCHIVE").error("Unable to archive a deleted Discord message.", error);
    }
  }
}

export { MessageArchiveDelete };
