import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";

import { reloadCommands } from "../../../infrastructure/loaders/commandLoader";
import { reloadComponentHandlers } from "../../../infrastructure/loaders/componentLoader";
import { createV2Response } from "../../../shared/factories/componentFactory";

interface ReloadResults {
  commands: number;
  components: number;
}

const DUNE_COLORS = [0xc58b45, 0xd2a85a, 0xa96832, 0x8f542c, 0x70452c, 0xb87333, 0x9c6b3c] as const;

const OWNER_ERROR_MESSAGE = "Only the configured owner role can reload bot modules.";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reload bot modules without restarting the process.")
    .addStringOption((option) => option.setName("area").setDescription("Area to reload").setRequired(true).addChoices({ name: "Commands", value: "commands" }, { name: "Components", value: "components" }, { name: "All", value: "all" })),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const ownerRoleId = process.env.OWNER_ROLE_ID;

    if (!ownerRoleId || !interaction.guild) {
      await interaction.reply({
        content: OWNER_ERROR_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(ownerRoleId)) {
      await interaction.reply({
        content: OWNER_ERROR_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const area = interaction.options.getString("area", true);

    const results: ReloadResults = {
      commands: 0,
      components: 0,
    };

    if (area === "commands" || area === "all") {
      results.commands = reloadCommands(interaction.client).loaded;
    }

    if (area === "components" || area === "all") {
      results.components = reloadComponentHandlers(interaction.client).loaded;
    }

    const accentColor = DUNE_COLORS[Math.floor(Math.random() * DUNE_COLORS.length)];

    const infoCard = new ContainerBuilder().setAccentColor(accentColor).addTextDisplayComponents((text) => text.setContent(`Reloaded ${results.commands} commands and ` + `${results.components} component handlers.`));

    await interaction.reply(createV2Response([infoCard]));
  },
};
