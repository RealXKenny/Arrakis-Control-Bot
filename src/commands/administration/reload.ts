import { Command, container } from "@sapphire/framework";
import { ChatInputCommandInteraction, ContainerBuilder, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../shared/factories/componentFactory";
import { registerApplicationCommand } from "../../support/registerApplicationCommand";

interface ReloadResults {
  commands: number;
  components: number;
}

const DUNE_COLORS = [0xc58b45, 0xd2a85a, 0xa96832, 0x8f542c, 0x70452c, 0xb87333, 0x9c6b3c] as const;

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

    const accentColor = DUNE_COLORS[Math.floor(Math.random() * DUNE_COLORS.length)];

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

class ReloadCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "reload", description: "Reload bot modules without restarting the process.", preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, command.data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return command.execute(interaction);
  }
}

export { ReloadCommand, reloadPieces };
