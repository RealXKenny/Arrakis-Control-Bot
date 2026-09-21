import { Events, Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { scopedLogger } from "../../client/logger";

class LevelingMessages extends Listener<typeof Events.MessageCreate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.MessageCreate });
  }

  public override async run(message: Message): Promise<void> {
    try {
      await this.container.client.leveling?.handleMessage(message);
    } catch (error: unknown) {
      scopedLogger(this.container.logger, "LEVELING").error("Unable to award community XP for a Discord message.", error);
    }
  }
}

export { LevelingMessages };
