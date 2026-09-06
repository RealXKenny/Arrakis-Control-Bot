import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createDuneBanner } from "../../../shared/factories/imageFactory";
import { createV2Response } from "../../../shared/factories/componentFactory";

const DUNE_COLORS = [0xc58b45, 0xd2a85a, 0xa96832, 0x8f542c, 0x70452c, 0xb87333, 0x9c6b3c] as const;

const DEFAULT_SERVER_NAME = "Dune: Awakening Community Server";

const getRandomDuneColor = (): number => DUNE_COLORS[Math.floor(Math.random() * DUNE_COLORS.length)];

const formatPing = (ping: number): string => (ping >= 0 ? `${ping}ms` : "Measuring...");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot response time."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { client } = interaction;

    const serverName = process.env.SERVER_NAME ?? DEFAULT_SERVER_NAME;

    const accentColor = getRandomDuneColor();

    const sent = await interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(accentColor)
          .addTextDisplayComponents((text) => text.setContent("## 🏓 Pong!"))
          .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents((text) => text.setContent("**Checking latency...**")),
      ],
      flags: MessageFlags.IsComponentsV2,
      withResponse: true,
    });

    const responseTimestamp = sent.resource?.message?.createdTimestamp;

    const latency = responseTimestamp !== undefined ? responseTimestamp - interaction.createdTimestamp : 0;

    const websocketPing = formatPing(client.ws.ping);

    const banner = createDuneBanner({
      filename: "dune-server-ping.png",
      title: "Pong",
      subtitle: "LATENCY CHECK",
      detail: serverName,
    });

    const pingCard = new ContainerBuilder()
      .setAccentColor(accentColor)

      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://dune-server-ping.png")))

      .addTextDisplayComponents((text) => text.setContent("## 🏓 Pong!"))

      .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`))

      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

      .addTextDisplayComponents((text) => text.setContent(["### 🛰️ Connection", `**Round-trip:** ${latency}ms`, `**WebSocket:** ${websocketPing}`].join("\n")))

      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

      .addTextDisplayComponents((text) => text.setContent(`-# Spice flows through Arrakis • Requested by ${interaction.user.tag}`));

    await interaction.editReply({
      ...createV2Response([pingCard], [banner]),
      allowedMentions: {
        parse: [],
      },
    });
  },
};
