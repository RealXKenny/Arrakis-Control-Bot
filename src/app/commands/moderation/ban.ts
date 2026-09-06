import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../../shared/factories/componentFactory";
import { hasStaffRole } from "../../../shared/utils/staffAccess";

const ERROR_COLOR = 0x8f3025;

const createCard = (title: string, content: string | string[], footer?: string): ContainerBuilder => {
  const card = new ContainerBuilder()
    .setAccentColor(ERROR_COLOR)
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(Array.isArray(content) ? content.join("\n") : content));

  if (footer) {
    card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent(footer));
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

const deny = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await replyWithCard(interaction, createCard("## 🔒 Permission Denied", "You need a configured staff role to use this command."));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server.")
    .addUserOption((option) => option.setName("user").setDescription("Member to ban.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason for the ban.")),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await deny(interaction);
      return;
    }

    const { guild } = interaction;

    const staffMember = await guild.members.fetch(interaction.user.id).catch(() => null);

    if (!hasStaffRole(staffMember)) {
      await deny(interaction);
      return;
    }

    const user = interaction.options.getUser("user", true);

    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member?.bannable) {
      await replyWithCard(interaction, createCard("## ❌ Unable to Ban", `I can't ban **${user.tag}**. They may have a higher role than the bot or cannot be banned.`));

      return;
    }

    const reason = interaction.options.getString("reason") ?? `Banned by ${interaction.user.tag}`;

    await member.ban({ reason });

    await replyWithCard(
      interaction,
      new ContainerBuilder()
        .setAccentColor(ERROR_COLOR)
        .addTextDisplayComponents((text) => text.setContent("## 🔨 Member Banned"))
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((text) => text.setContent(["### 📋 Ban Summary", `**User:** ${user.tag}`, `**Reason:** ${reason}`].join("\n")))
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((text) => text.setContent(`-# Banned by ${interaction.user.tag}`)),
    );
  },
};
