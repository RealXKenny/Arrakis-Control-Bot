import { Command, container } from "@sapphire/framework";
import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { formatPlayers } from "../../modules/formatters/players";
import type { PlayerResponse } from "../../modules/formatters/players";
import { createV2Response } from "../../shared/factories/componentFactory";
import { createDuneBanner } from "../../shared/factories/imageFactory";
import { truncateDiscordText } from "../../shared/utils/discordLimits";
import { registerApplicationCommand } from "../../support/registerApplicationCommand";

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
    .addTextDisplayComponents((text) => text.setContent(`-# ${truncateDiscordText(serverName, 150, "…")}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  card.addTextDisplayComponents((text) => text.setContent(truncateDiscordText([`### 🟢 ${online.heading}`, online.content, online.truncated ? `_${online.truncated}_` : null].filter(Boolean).join("\n"), 1_550)));

  card
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText([`### 🔴 ${offline.heading}`, offline.content, offline.truncated ? `_${offline.truncated}_` : null].filter(Boolean).join("\n"), 1_550)))
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

const command = {
  data: new SlashCommandBuilder().setName("players").setDescription("Show online and offline Dune players."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const serverName = getServerName();

    try {
      const { duneApi } = container.client;

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

      container.logger.error("Unable to retrieve Dune player lists.", error);
    }
  },
};

class PlayersCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "players", description: "Show online and offline Dune players.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, command.data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return command.execute(interaction);
  }
}

export { PlayersCommand };

function toPlayerResponse(value: unknown): PlayerResponse {
  return Array.isArray(value) || (value !== null && typeof value === "object") ? (value as PlayerResponse) : null;
}
