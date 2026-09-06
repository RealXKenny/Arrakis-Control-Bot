import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";

const ACCENT_COLOR = 0xc58b45;

const formatDiscordTimestamp = (date: Date | null | undefined, fallback = "Not available"): string => (date ? `<t:${Math.floor(date.getTime() / 1000)}:F>` : fallback);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Display information about a Discord member.")
    .addUserOption((option) => option.setName("user").setDescription("Member to inspect.")),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("user") ?? interaction.user;

    const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;

    const createdAt = formatDiscordTimestamp(user.createdAt);
    const joinedAt = formatDiscordTimestamp(member?.joinedAt);

    const card = new ContainerBuilder()
      .setAccentColor(ACCENT_COLOR)

      .addTextDisplayComponents((text) => text.setContent(`## 👤 User Information\n**${user.tag}**`))

      .addTextDisplayComponents((text) => text.setContent([`**User ID:** \`${user.id}\``, `**Account created:** ${createdAt}`, `**Joined this server:** ${joinedAt}`, `**Bot account:** ${user.bot ? "Yes" : "No"}`].join("\n")));

    await interaction.reply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        parse: [],
      },
    });
  },
};
