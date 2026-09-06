import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";
import { formatPlayers } from "../../../modules/formatters/players";
import type { PlayerResponse } from "../../../modules/formatters/players";
import { createV2Response } from "../../../shared/factories/componentFactory";
import { createDuneBanner } from "../../../shared/factories/imageFactory";

const logger = createLogger("PLAYERS");

const PAGE_SIZE = 20;
const SERVER_NAME = "Dune: Awakening Community Server";

const COLORS = {
  error: 0x8f3025,
  accent: 0xc58b45,
} as const;

const getServerName = (): string => process.env.SERVER_NAME?.trim() || SERVER_NAME;

const getPlayerCount = (response: unknown, formatted: { content?: string }): number => {
  if (!response || typeof response !== "object") {
    return getFormattedPlayerCount(formatted);
  }

  const data = response as {
    total?: unknown;
    totalCount?: unknown;
    count?: unknown;
    players?: unknown;
    data?: unknown;
  };

  if (typeof data.total === "number") {
    return data.total;
  }

  if (typeof data.totalCount === "number") {
    return data.totalCount;
  }

  if (typeof data.count === "number") {
    return data.count;
  }

  if (Array.isArray(data.players)) {
    return data.players.length;
  }

  if (Array.isArray(data.data)) {
    return data.data.length;
  }

  return getFormattedPlayerCount(formatted);
};

const getFormattedPlayerCount = (formatted: { content?: string }): number => {
  return formatted.content ? formatted.content.split("\n").filter(Boolean).length : 0;
};

const createCard = (serverName: string, online: ReturnType<typeof formatPlayers>, offline: ReturnType<typeof formatPlayers>, requestedBy: string): ContainerBuilder => {
  const card = new ContainerBuilder()
    .setAccentColor(COLORS.accent)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://dune-server-players.png")))
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Dune Players"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  card.addTextDisplayComponents((text) => text.setContent([`### 🟢 ${online.heading}`, online.content, online.truncated ? `_${online.truncated}_` : null].filter(Boolean).join("\n")));

  card
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent([`### 🔴 ${offline.heading}`, offline.content, offline.truncated ? `_${offline.truncated}_` : null].filter(Boolean).join("\n")))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`-# Spice flows through Arrakis • Requested by ${requestedBy}`));

  return card;
};

const createErrorCard = (serverName: string): ContainerBuilder => {
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Dune Players"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${serverName}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(["### ⚠️ Unable to retrieve players", "The Dune server player list could not be retrieved. Please try again later."].join("\n")));
};

module.exports = {
  data: new SlashCommandBuilder().setName("players").setDescription("Show online and offline Dune players."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const serverName = getServerName();

    try {
      const { duneApi } = interaction.client;

      const [onlineResponse, offlineResponse] = await Promise.all([
        duneApi.call("GET", "/api/players", {
          query: {
            status: "online",
            page: 0,
            pageSize: PAGE_SIZE,
          },
        }),
        duneApi.call("GET", "/api/players", {
          query: {
            status: "offline",
            page: 0,
            pageSize: PAGE_SIZE,
          },
        }),
      ]);

      const onlineData = toPlayerResponse(onlineResponse);
      const offlineData = toPlayerResponse(offlineResponse);
      const online = formatPlayers(onlineData, "online");
      const offline = formatPlayers(offlineData, "offline");

      const onlineCount = getPlayerCount(onlineData, online);
      const offlineCount = getPlayerCount(offlineData, offline);

      const banner = createDuneBanner({
        filename: "dune-server-players.png",
        title: "Dune Players",
        subtitle: `${onlineCount} ONLINE • ${offlineCount} OFFLINE`,
        detail: serverName,
      });

      const playersCard = createCard(serverName, online, offline, interaction.user.tag);

      await interaction.editReply({
        ...createV2Response([playersCard], [banner]),
        allowedMentions: {
          parse: [],
        },
      });
    } catch (error: unknown) {
      await interaction.editReply({
        ...createV2Response([createErrorCard(serverName)]),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: {
          parse: [],
        },
      });

      logger.error("Unable to retrieve Dune player lists.", error);
    }
  },
};

function toPlayerResponse(value: unknown): PlayerResponse {
  return Array.isArray(value) || (value !== null && typeof value === "object") ? (value as PlayerResponse) : null;
}
