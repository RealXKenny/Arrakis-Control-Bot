import { ButtonInteraction, MessageFlags } from "discord.js";

import { createActorContext } from "../../../shared/utils/createActorContext";
import { truncateDiscordText } from "../../../shared/utils/discordLimits";

module.exports = {
  customId: "player-unlink",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const { discordAdapter, auditLogger } = interaction.client;

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
