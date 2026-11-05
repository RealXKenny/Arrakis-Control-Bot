import { container } from "@sapphire/framework";
import { ChatInputCommandInteraction, ContainerBuilder, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../../shared/discord/componentFactory";
import { PANEL_ACCENT_ROTATION } from "../../../shared/discord/panelStyle";

interface ReloadResults {
  commands: number;
  components: number;
}

const ACCENT_COLORS = PANEL_ACCENT_ROTATION;

const command = {
  data: new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reload bot modules without restarting the process.")
    .addStringOption((option) => option.setName("area").setDescription("Area to reload").setRequired(true).addChoices({ name: "Commands", value: "commands" }, { name: "Components", value: "components" }, { name: "All", value: "all" })),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const area = interaction.options.getString("area", true);

    const results: ReloadResults = {
      commands: 0,
      components: 0,
    };

    if (area === "commands" || area === "all") {
      results.commands = await reloadPieces(container.stores.get("commands").values());
    }

    if (area === "components" || area === "all") {
      results.components = await reloadPieces(container.stores.get("interaction-handlers").values());
    }

    const accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];

    const infoCard = new ContainerBuilder().setAccentColor(accentColor).addTextDisplayComponents((text) => text.setContent(`Reloaded ${results.commands} commands and ` + `${results.components} component handlers.`));

    await interaction.reply(createV2Response([infoCard]));
  },
};

async function reloadPieces(pieces: Iterable<{ reload(): Promise<unknown> }>): Promise<number> {
  const loadedPieces = [...pieces];

  for (const piece of loadedPieces) {
    await piece.reload();
  }

  return loadedPieces.length;
}

export { reloadPieces };


export const groupedAction = command;
