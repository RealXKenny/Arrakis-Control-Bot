import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";

const RATE_LIMIT_ERROR_MESSAGE = "Please wait a moment before trying that again.";

class InteractionRateLimit extends Precondition {
  public constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
    super(context, { ...options, name: "InteractionRateLimit" });
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction): Precondition.Result {
    const key = `${interaction.user.id}:/${interaction.commandName}`;

    return this.container.client.interactionRateLimiter.allow(key) ? this.ok() : this.error({ identifier: "InteractionRateLimit", message: RATE_LIMIT_ERROR_MESSAGE });
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    InteractionRateLimit: never;
  }
}

export { InteractionRateLimit, RATE_LIMIT_ERROR_MESSAGE };
