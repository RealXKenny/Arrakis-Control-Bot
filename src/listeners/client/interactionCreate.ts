import { Events, Listener } from "@sapphire/framework";
import type { Interaction } from "discord.js";

import { describeInteraction } from "../../support/interactionResponses";

class InteractionCreate extends Listener<typeof Events.InteractionCreate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.InteractionCreate });
  }

  public override async run(interaction: Interaction): Promise<void> {
    const interactionType = describeInteraction(interaction);
    this.container.logger.debug("Interaction received.", {
      type: interactionType,
      interactionId: interaction.id,
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    await this.container.client.auditLogger?.interaction(interaction, interactionType);
  }
}

export { InteractionCreate };
