import { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, ModalSubmitInteraction, SeparatorSpacingSize } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";
import { createActorContext } from "../../../shared/utils/createActorContext";

const logger = createLogger("PLAYER LINK");

interface LinkPlayerResult {
  ok?: boolean;
  message?: string | null;
  error?: string | null;
  characterName?: string | null;
  character_name?: string | null;
  onlineStatus?: string | boolean | null;
  online_status?: string | boolean | null;
  [key: string]: unknown;
}

module.exports = {
  customId: "player-link-modal",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const { discordAdapter, auditLogger } = interaction.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const characterName = interaction.fields.getTextInputValue("character-name").trim();

    const actor = createActorContext(interaction, "player-link");

    const result = (await discordAdapter.linkPlayer(actor, characterName)) as LinkPlayerResult;

    logger.debug("Link request response received.", {
      ok: result?.ok ?? false,
      message: result?.message ?? null,
      characterName: result?.characterName ?? result?.character_name ?? characterName,
      onlineStatus: result?.onlineStatus ?? result?.online_status ?? null,
      responseFields: Object.keys(result ?? {}),
    });

    if (!result?.ok) {
      await interaction.editReply(result?.error ?? "Unable to start character linking.");
      return;
    }

    await auditLogger?.playerLinkRequested(interaction, result);

    const verifyButton = new ButtonBuilder().setCustomId("player-verify").setLabel("Verify Code").setStyle(ButtonStyle.Success);

    const verificationCard = new ContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplayComponents((text) => text.setContent("## Verification code sent"))
      .addTextDisplayComponents((text) => text.setContent(result.message ?? "A private verification code was sent to your character in-game."))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) => row.setComponents(verifyButton));

    await interaction.editReply({
      content: null,
      components: [verificationCard],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
