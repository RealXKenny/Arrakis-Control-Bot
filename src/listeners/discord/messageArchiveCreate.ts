import { Events, Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { scopedLogger } from "../../client/logger";

class MessageArchiveCreate extends Listener<typeof Events.MessageCreate> {
  public constructor(context: Listener.LoaderContext) { super(context, { event: Events.MessageCreate }); }
  public override async run(message: Message): Promise<void> {
    try {
      await this.container.client.messageArchive?.created(message);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "MESSAGE ARCHIVE").error("Unable to archive a Discord message.", error);
    }
  }
}

export { MessageArchiveCreate };
