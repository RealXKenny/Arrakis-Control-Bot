import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../../shared/factories/componentFactory";
import { hasStaffRole } from "../../../shared/utils/staffAccess";

const COLORS = {
  error: 0x8f3025,
  success: 0xc58b45,
} as const;

const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Timeout a member.")
  .addUserOption((option) => option.setName("user").setDescription("Member to timeout.").setRequired(true))
  .addIntegerOption((option) => option.setName("minutes").setDescription("Timeout duration in minutes.").setMinValue(1).setMaxValue(40320).setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("Reason for the timeout."));

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

async function deny(interaction: ChatInputCommandInteraction): Promise<void> {
  await replyWithCard(interaction, createCard("## 🔒 Permission Denied", "You need a configured staff role to use this command.", COLORS.error));
}

async function denyServerOnly(interaction: ChatInputCommandInteraction): Promise<void> {
  await replyWithCard(interaction, createCard("## ⚠️ Server Only", "This command can only be used inside a server.", COLORS.error));
}

module.exports = {
  data,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await denyServerOnly(interaction);
      return;
    }

    const { guild } = interaction;

    const staffMember = await guild.members.fetch(interaction.user.id).catch(() => null);

    if (!staffMember || !hasStaffRole(staffMember)) {
      await deny(interaction);
      return;
    }

    const user = interaction.options.getUser("user", true);
    const targetMember = await guild.members.fetch(user.id).catch(() => null);

    if (!targetMember?.moderatable) {
      await replyWithCard(interaction, createCard("## ❌ Unable to Timeout", `I can't timeout **${user.tag}**. They may have a higher role than the bot or cannot be moderated.`, COLORS.error));
      return;
    }

    const minutes = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") ?? `Timed out by ${interaction.user.tag}`;

    await targetMember.timeout(minutes * 60_000, reason);

    const duration = `${minutes} minute${minutes === 1 ? "" : "s"}`;

    await replyWithCard(interaction, createCard("## 🔇 Member Timed Out", ["### 📋 Timeout Summary", `**User:** ${user.tag}`, `**Duration:** ${duration}`, `**Reason:** ${reason}`].join("\n"), COLORS.success, `Timed out by ${interaction.user.tag}`));
  },
};
