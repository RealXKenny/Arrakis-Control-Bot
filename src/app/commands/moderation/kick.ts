import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../../shared/factories/componentFactory";
import { hasStaffRole } from "../../../shared/utils/staffAccess";

const COLORS = {
  error: 0x8f3025,
  success: 0xc58b45,
} as const;

const createCard = (title: string, content: string, accentColor: number, footer?: string): ContainerBuilder => {
  const card = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(content));

  if (footer) {
    card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent(`-# ${footer}`));
  }

  return card;
};

const replyWithCard = async (interaction: ChatInputCommandInteraction, card: ContainerBuilder): Promise<void> => {
  await interaction.reply({
    ...createV2Response([card]),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
    },
  });
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .addUserOption((option) => option.setName("user").setDescription("Member to kick.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason for the kick.")),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await deny(interaction);
      return;
    }

    const { guild } = interaction;
    const user = interaction.options.getUser("user", true);
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!hasStaffRole(member)) {
      await deny(interaction);
      return;
    }

    if (!member?.kickable) {
      await replyWithCard(interaction, createCard("## ❌ Unable to Kick", `I can't kick **${user.tag}**. They may have a higher role than the bot or cannot be kicked.`, COLORS.error));
      return;
    }

    const reason = interaction.options.getString("reason") ?? `Kicked by ${interaction.user.tag}`;

    await member.kick(reason);

    await replyWithCard(interaction, createCard("## 👢 Member Kicked", ["### 📋 Kick Summary", `**User:** ${user.tag}`, `**Reason:** ${reason}`].join("\n"), COLORS.success, `Kicked by ${interaction.user.tag}`));
  },
};

async function deny(interaction: ChatInputCommandInteraction): Promise<void> {
  await replyWithCard(interaction, createCard("## 🔒 Permission Denied", "You need a configured staff role to use this command.", COLORS.error));
}
