import { ButtonBuilder, ButtonStyle, ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from "discord.js";

import { createActorContext } from "../../../shared/utils/createActorContext.js";
import { createV2Response } from "../../../shared/factories/componentFactory.js";

module.exports = {
  customId: "player-link",

  async execute(interaction: ButtonInteraction): Promise<void> {
    const { discordAdapter } = interaction.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    const actorContext = createActorContext(interaction, "player-link");
    const linked = await discordAdapter.getCurrentPlayer(actorContext);

    if (linked?.linked === true) {
      const characterName = linked.characterName ?? "your Dune character";

      const unlinkButton = new ButtonBuilder().setCustomId("player-unlink").setLabel("Unlink Account").setStyle(ButtonStyle.Danger);

      const card = new ContainerBuilder()
        .setAccentColor(0xd2a85a)
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
