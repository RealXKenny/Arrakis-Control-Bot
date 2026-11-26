import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from "discord.js";

import { createActorContext } from "../../../shared/actors/createActorContext";
import { PRE_ACKNOWLEDGEMENT_DEADLINE_MS, withDeadline } from "../../../shared/async/withDeadline";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { RateLimitedInteractionHandler } from "../../../support/interactions/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../../support/interactions/componentCustomIds";
import { PANEL_COLORS } from "../../../shared/discord/panelStyle";

const handler = {
  customId: "player-link",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const { discordAdapter } = container.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    const actorContext = createActorContext(interaction, "player-link");
    // The modal cannot be deferred, so a slow or failing lookup falls through to the form;
    // the submit handler reports an existing link from the adapter's answer.
    const linked = await withDeadline(discordAdapter.getCurrentPlayer(actorContext), PRE_ACKNOWLEDGEMENT_DEADLINE_MS).catch(() => null);

    if (linked?.linked === true) {
      const characterName = linked.characterName ?? "your Dune character";

      const unlinkButton = new ButtonBuilder().setCustomId("player-unlink").setLabel("Unlink Account").setStyle(ButtonStyle.Danger);

      const card = new ContainerBuilder()
        .setAccentColor(PANEL_COLORS.accent)
        .addTextDisplayComponents((text) => text.setContent("## Account already linked"))
        .addTextDisplayComponents((text) => text.setContent(`Your Discord account is already linked to **${characterName}**. ` + "Unlink it below if you want to connect a different character."))
        .addActionRowComponents((row) => row.setComponents(unlinkButton));

      await interaction.reply({
        ...createV2Response([card]),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });

      return;
    }

    const characterNameInput = new TextInputBuilder().setCustomId("character-name").setStyle(TextInputStyle.Short).setPlaceholder("Enter your exact in-game character name").setRequired(true).setMaxLength(80);

    const characterNameLabel = new LabelBuilder().setLabel("Character name").setTextInputComponent(characterNameInput);

    const modal = new ModalBuilder().setCustomId("player-link-modal").setTitle("Link Dune Character").addLabelComponents(characterNameLabel);

    await interaction.showModal(modal);
  },
};

class PlayerLinkButton extends RateLimitedInteractionHandler<ButtonInteraction> {
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

export { PlayerLinkButton };
