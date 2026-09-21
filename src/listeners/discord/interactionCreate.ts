import { Events, Listener } from "@sapphire/framework";
import type { Interaction } from "discord.js";

import { describeInteraction } from "../../support/interactions/interactionResponses";
import { scopedLogger } from "../../client/logger";

class InteractionCreate extends Listener<typeof Events.InteractionCreate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.InteractionCreate });
  }

  public override async run(interaction: Interaction): Promise<void> {
    const interactionType = describeInteraction(interaction);
    scopedLogger(this.container.logger, "INTERACTIONS").debug("Interaction received.", {
      type: interactionType,
      interactionId: interaction.id,
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    if (isMusicComponent(interaction)) return;
    await this.container.client.auditLogger?.interaction(interaction, interactionType);
  }
}

function isMusicComponent(interaction: Interaction): boolean {
  return (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) &&
    (interaction.customId.startsWith("music:") || interaction.customId.startsWith("music-edit:") || interaction.customId.startsWith("music-confirm:"));
}

export { InteractionCreate };
