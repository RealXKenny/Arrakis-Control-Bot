import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, ModalSubmitInteraction, SeparatorSpacingSize } from "discord.js";

import { createActorContext } from "../../shared/utils/createActorContext";
import { truncateDiscordText } from "../../shared/utils/discordLimits";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

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

const handler = {
  customId: "player-link-modal",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const { discordAdapter, auditLogger } = container.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const characterName = interaction.fields.getTextInputValue("character-name").trim();

    const actor = createActorContext(interaction, "player-link");

    const result = (await discordAdapter.linkPlayer(actor, characterName)) as LinkPlayerResult;

    container.logger.debug("Link request response received.", {
      ok: result?.ok ?? false,
      message: result?.message ?? null,
      characterName: result?.characterName ?? result?.character_name ?? characterName,
      onlineStatus: result?.onlineStatus ?? result?.online_status ?? null,
      responseFields: Object.keys(result ?? {}),
    });

    if (!result?.ok) {
      await interaction.editReply(truncateDiscordText(result?.error ?? "Unable to start character linking.", 1_900, "…"));
      return;
    }

    await auditLogger?.playerLinkRequested(interaction, result);

    const verifyButton = new ButtonBuilder().setCustomId("player-verify").setLabel("Verify Code").setStyle(ButtonStyle.Success);

    const verificationCard = new ContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplayComponents((text) => text.setContent("## Verification code sent"))
      .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(result.message ?? "A private verification code was sent to your character in-game.", 3_500)))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) => row.setComponents(verifyButton));

    await interaction.editReply({
      content: null,
      components: [verificationCard],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};

class PlayerLinkModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ModalSubmitInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { PlayerLinkModal };
