import { Command, container } from "@sapphire/framework";
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../shared/factories/componentFactory";
import { registerApplicationCommand } from "../../support/registerApplicationCommand";

const COLORS = {
  error: 0x8f3025,
  success: 0xc58b45,
} as const;

const createCard = (title: string, content: string | string[], accentColor: number, footer?: string): ContainerBuilder => {
  const card = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(Array.isArray(content) ? content.join("\n") : content));

  if (footer) {
    card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent(footer));
  }

  return card;
};

const replyWithCard = async (interaction: ChatInputCommandInteraction, card: ContainerBuilder): Promise<void> => {
  await interaction.editReply({
    ...createV2Response([card]),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
    },
  });
};

const command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages from this channel.")
    .addIntegerOption((option) => option.setName("amount").setDescription("Number of messages to delete (1–100).").setMinValue(1).setMaxValue(100).setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    if (!interaction.inGuild() || !interaction.guild) {
      await replyWithCard(interaction, createCard("## ⚠️ Server Only", "This command can only be used inside a server.", COLORS.error));

      return;
    }

    const amount = interaction.options.getInteger("amount", true);

    try {
      if (!interaction.channel?.isTextBased()) {
        throw new Error("This command can only be used in a text channel.");
      }

      const deleted = await interaction.channel.bulkDelete(amount, true);

      await replyWithCard(interaction, createCard("## 🧹 Messages Purged", ["### 📋 Purge Summary", `**Requested:** ${amount}`, `**Deleted:** ${deleted.size}`], COLORS.success, `-# Purged by ${interaction.user.tag}`));
    } catch (error: unknown) {
      container.logger.error("Failed to purge messages", {
        error,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        amount,
      });

      await replyWithCard(interaction, createCard("## ❌ Purge Failed", "I couldn't delete the requested messages. Make sure I have the required permissions and that this is a supported text channel.", COLORS.error));
    }
  },
};

class PurgeCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "purge", description: "Delete recent messages from this channel.", preconditions: ["InteractionRateLimit", "StaffOnly"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, command.data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return command.execute(interaction);
  }
}

export { PurgeCommand };
