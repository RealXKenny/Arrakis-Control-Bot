import { Command, container } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { buildStormPanel, parseCoriolisEnd, stormWindowFromEnd } from "../../modules/panels/stormAnnouncement";
import { registerApplicationCommand } from "../../support/registerApplicationCommand";

export const data = new SlashCommandBuilder().setName("storm").setDescription("Show the current Coriolis storm schedule.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const response = await container.client.duneApi.call("GET", "/api/map/markers", { query: { static: 0 } });
    const window = stormWindowFromEnd(parseCoriolisEnd(response));
    if (window.end <= Date.now()) throw new Error("The Console API has not published the next Coriolis cycle yet.");
    const panel = buildStormPanel(window.start, window.end);
    await interaction.editReply({
      components: panel.components,
      files: panel.files,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  } catch (error: unknown) {
    container.logger.error("Unable to retrieve the Coriolis storm schedule.", error);
    const card = new ContainerBuilder()
      .setAccentColor(0x8f3025)
      .addTextDisplayComponents((text) => text.setContent("## Coriolis Storm Schedule"))
      .addTextDisplayComponents((text) => text.setContent("The live storm schedule is unavailable. Please try again shortly."));
    await interaction.editReply({ content: null, components: [card], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }
}

class StormCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "storm", description: "Show the current Coriolis storm schedule.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { StormCommand };
