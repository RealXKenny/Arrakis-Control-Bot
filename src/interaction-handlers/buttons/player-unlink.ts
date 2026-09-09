import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { ButtonInteraction, MessageFlags } from "discord.js";

import { createActorContext } from "../../shared/utils/createActorContext";
import { truncateDiscordText } from "../../shared/utils/discordLimits";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const handler = {
  customId: "player-unlink",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const { discordAdapter, auditLogger } = container.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const actorContext = createActorContext(interaction, "player-unlink");
    const result = await discordAdapter.unlinkPlayer(actorContext);

    await interaction.editReply(truncateDiscordText(result?.message ?? "Your Dune character has been unlinked.", 1_900, "…"));

    if (result?.ok) {
      await auditLogger?.playerUnlinked(interaction);
    }
  },
};

class PlayerUnlinkButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ButtonInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { PlayerUnlinkButton };
