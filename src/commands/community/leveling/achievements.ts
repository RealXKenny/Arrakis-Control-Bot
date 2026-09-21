import { Command } from "@sapphire/framework";
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { achievementPanel } from "../../../modules/community/leveling/achievementPanel";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View your community achievements or another member's progress.")
  .addUserOption((option) => option.setName("member").setDescription("Member whose achievements you want to view."));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!interaction.guildId || !interaction.client.leveling) {
    await interaction.editReply({ content: "Community leveling is not available here. Configure PostgreSQL and restart the bot.", allowedMentions: { parse: [] } });
    return;
  }

  try {
    const user = interaction.options.getUser("member") ?? interaction.user;
    const { profile, unlockedIds } = await interaction.client.leveling.achievements(interaction.guildId, user.id);
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null) ?? null;
    const displayName = member?.displayName ?? user.globalName ?? user.username;
    await interaction.editReply({ content: null, components: [achievementPanel(displayName, profile, unlockedIds)],
      flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch {
    await interaction.editReply({ content: "Achievements could not be loaded right now. Please try again shortly.", components: [], allowedMentions: { parse: [] } });
  }
}

class AchievementsCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "achievements", description: "View community achievements.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { AchievementsCommand, data, execute };
