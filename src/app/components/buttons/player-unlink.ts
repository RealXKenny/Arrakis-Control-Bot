import { ButtonInteraction, MessageFlags } from "discord.js";

import { createActorContext } from "../../../shared/utils/createActorContext.js";

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

    await interaction.editReply(result?.message ?? "Your Dune character has been unlinked.");

    if (result?.ok) {
      await auditLogger?.playerUnlinked(interaction);
    }
  },
};
