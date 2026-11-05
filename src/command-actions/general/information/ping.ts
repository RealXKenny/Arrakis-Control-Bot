import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createPanelBanner } from "../../../shared/discord/imageFactory";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { PANEL_ACCENT_ROTATION } from "../../../shared/discord/panelStyle";

const ACCENT_COLORS = PANEL_ACCENT_ROTATION;

const DEFAULT_SERVER_NAME = "Dune: Awakening Community Server";

const getRandomAccentColor = (): number => ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];

const formatPing = (ping: number): string => (ping >= 0 ? `${ping}ms` : "Measuring...");

const command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot response time."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { client } = interaction;

    const serverName = process.env.SERVER_NAME ?? DEFAULT_SERVER_NAME;

    const accentColor = getRandomAccentColor();

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

    const banner = createPanelBanner({
      artwork: "ping",
      filename: "dune-server-ping.png",
      title: "Pong",
      subtitle: "Latency check",
      detail: serverName,
    });

    const pingCard = new ContainerBuilder()
      .setAccentColor(accentColor)

      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://dune-server-ping.png").setDescription("Arrakis signal latency check")))

      .addTextDisplayComponents((text) => text.setContent("## 🏓 Pong!"))

      .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`))

      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

      .addTextDisplayComponents((text) => text.setContent(["### 🛰️ Connection", `**Round-trip:** ${latency}ms`, `**WebSocket:** ${websocketPing}`].join("\n")))

      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))

      .addTextDisplayComponents((text) => text.setContent(`-# Arrakis Control • Requested by ${interaction.user.tag}`));

    await interaction.editReply({
      ...createV2Response([pingCard], [banner]),
      allowedMentions: {
        parse: [],
      },
    });
  },
};




export const groupedAction = command;
