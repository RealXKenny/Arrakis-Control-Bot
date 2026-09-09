import { Command } from "@sapphire/framework";
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../shared/factories/componentFactory";
import { canModerateMember, hasStaffRole } from "../../shared/utils/staffAccess";
import { registerApplicationCommand } from "../../support/registerApplicationCommand";

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
  await interaction.editReply({
    ...createV2Response([card]),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
    },
  });
};

const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server.")
  .addUserOption((option) => option.setName("user").setDescription("Member to kick.").setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("Reason for the kick.").setMaxLength(512));

async function execute(interaction: ChatInputCommandInteraction, authorizationChecked = false): Promise<void> {
  await interaction.deferReply();

  if (!interaction.inGuild() || !interaction.guild) {
    await deny(interaction);
    return;
  }

  const { guild } = interaction;
  const staffMember = await guild.members.fetch(interaction.user.id).catch(() => null);

  if (!staffMember || (!authorizationChecked && !hasStaffRole(staffMember))) {
    await deny(interaction);
    return;
  }

  const user = interaction.options.getUser("user", true);
  const member = await guild.members.fetch(user.id).catch(() => null);

  if (!member || !canModerateMember(staffMember, member, guild.ownerId) || !member.kickable) {
    await replyWithCard(interaction, createCard("## ❌ Unable to Kick", `I can't kick **${user.tag}**. You or the bot may not have a high enough role, or the member cannot be kicked.`, COLORS.error));
    return;
  }

  const reason = interaction.options.getString("reason") ?? `Kicked by ${interaction.user.tag}`;

  await member.kick(reason);

  await replyWithCard(interaction, createCard("## 👢 Member Kicked", ["### 📋 Kick Summary", `**User:** ${user.tag}`, `**Reason:** ${reason}`].join("\n"), COLORS.success, `Kicked by ${interaction.user.tag}`));
}

async function deny(interaction: ChatInputCommandInteraction): Promise<void> {
  await replyWithCard(interaction, createCard("## 🔒 Permission Denied", "You need a configured staff role to use this command.", COLORS.error));
}

class KickCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "kick", description: "Kick a member from the server.", preconditions: ["InteractionRateLimit", "StaffOnly"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction, true);
  }
}

export { execute, KickCommand };
