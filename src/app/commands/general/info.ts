import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorSpacingSize, SlashCommandBuilder, version as discordJsVersion } from "discord.js";

import { getBotVersion } from "../../../infrastructure/config/version.js";
import { createDuneBanner } from "../../../shared/factories/imageFactory.js";
import { createV2Response } from "../../../shared/factories/componentFactory.js";

const DUNE_COLORS = [0xc58b45, 0xd2a85a, 0xa96832, 0x8f542c, 0x70452c, 0xb87333, 0x9c6b3c] as const;

const DEFAULT_SERVER_NAME = "Dune: Awakening Community Server";

const formatUptime = (totalSeconds: number): string => {
  let seconds = Math.floor(totalSeconds);

  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;

  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
};

const formatMemory = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const getRandomDuneColor = (): number => DUNE_COLORS[Math.floor(Math.random() * DUNE_COLORS.length)];

const createBanner = (serverName: string) =>
  createDuneBanner({
    filename: "dune-server-info.png",
    title: "Arrakis Control",
    subtitle: "BOT INFORMATION",
    detail: serverName,
  });

const createInfoCard = (interaction: ChatInputCommandInteraction, serverName: string) => {
  const { client } = interaction;

  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = Math.floor(client.uptime / 1000);
  const websocketPing = client.ws.ping >= 0 ? `${client.ws.ping}ms` : "Measuring...";

  const createdTimestamp = Math.floor(client.user.createdTimestamp / 1000);
  const onlineSince = Math.floor((Date.now() - client.uptime) / 1000);

  return new ContainerBuilder()
    .setAccentColor(getRandomDuneColor())

    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://dune-server-info.png")))

    .addTextDisplayComponents((text) => text.setContent(`## 🏜️ ${client.user.username}`))

    .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`))

    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

    .addTextDisplayComponents((text) => text.setContent(["### 🏜️ Bot", `**Version:** v${getBotVersion()}`, `**User ID:** \`${client.user.id}\``, `**Created:** <t:${createdTimestamp}:D>`].join("\n")))

    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "### 🦂 Statistics",
          `**Servers:** ${client.guilds.cache.size.toLocaleString()}`,
          `**Cached users:** ${client.users.cache.size.toLocaleString()}`,
          `**Cached channels:** ${client.channels.cache.size.toLocaleString()}`,
          `**Registered commands:** ${client.commands?.size ?? 0}`,
        ].join("\n"),
      ),
    )

    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

    .addTextDisplayComponents((text) => text.setContent(["### 🛰️ Connection", `**WebSocket:** ${websocketPing}`, `**Uptime:** ${formatUptime(uptimeSeconds)}`, `**Online since:** <t:${onlineSince}:R>`].join("\n")))

    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "### ⚙️ Runtime",
          `**discord.js:** v${discordJsVersion}`,
          `**Node.js:** ${process.version}`,
          `**Platform:** ${process.platform}`,
          `**Architecture:** ${process.arch}`,
          `**Memory:** ${formatMemory(memoryUsage.rss)}`,
          `**Heap:** ${formatMemory(memoryUsage.heapUsed)} / ${formatMemory(memoryUsage.heapTotal)}`,
        ].join("\n"),
      ),
    )

    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

    .addTextDisplayComponents((text) => text.setContent(`-# Spice flows through Arrakis • Requested by ${interaction.user.tag}`));
};

module.exports = {
  data: new SlashCommandBuilder().setName("info").setDescription("View information about this bot."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const serverName = process.env.SERVER_NAME ?? DEFAULT_SERVER_NAME;

    const banner = createBanner(serverName);
    const infoCard = createInfoCard(interaction, serverName);

    await interaction.reply(createV2Response([infoCard], [banner]));
  },
};
