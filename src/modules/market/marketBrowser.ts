import { container } from "@sapphire/framework";
import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

import { createV2Response } from "../../shared/discord/componentFactory";
import { createDuneBanner } from "../../shared/discord/imageFactory";
import { truncateDiscordText } from "../../shared/discord/discordLimits";
import { formatMarketRows, parseBuybackPercent, parseMarketPage } from "./marketFormatter";
import type { MarketSession } from "./marketSessions";

const PAGE_SIZE = 10;
const IMAGE_NAME = "choam-market.png";
const ALL_CATEGORIES = "__all__";
const MAX_CATEGORY_OPTIONS = 24;
const ACCENT_COLOR = 0xc58b45;
const ERROR_COLOR = 0x8f3025;

type MarketInteraction = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;

function visibleCategories(session: MarketSession): string[] {
  const categories = session.categories.filter((category) => category !== session.category).slice(0, MAX_CATEGORY_OPTIONS);

  if (session.category) categories.unshift(session.category);
  return categories.slice(0, MAX_CATEGORY_OPTIONS);
}

function createMarketCard(content: string, summary: string, session: MarketSession): ContainerBuilder {
  const categoryOptions = [
    new StringSelectMenuOptionBuilder().setLabel("All categories").setValue(ALL_CATEGORIES).setDefault(!session.category),
    ...visibleCategories(session).map((category) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(truncateDiscordText(category, 40, "…"))
        .setValue(category.slice(0, 100))
        .setDefault(category === session.category),
    ),
  ];
  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId(`market-category:${session.id}`)
    .setPlaceholder(session.category ? truncateDiscordText(session.category, 40, "…") : "All categories")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(categoryOptions);
  const first = new ButtonBuilder().setCustomId(`market-page:${session.id}:first`).setLabel("First").setStyle(ButtonStyle.Secondary).setDisabled(session.page <= 1);
  const previous = new ButtonBuilder().setCustomId(`market-page:${session.id}:previous`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(session.page <= 1);
  const next = new ButtonBuilder().setCustomId(`market-page:${session.id}:next`).setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(session.page >= session.totalPages);
  const last = new ButtonBuilder().setCustomId(`market-page:${session.id}:last`).setLabel("Last").setStyle(ButtonStyle.Secondary).setDisabled(session.page >= session.totalPages);

  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${IMAGE_NAME}`).setDescription("CHOAM Exchange market board")))
    .addTextDisplayComponents((text) => text.setContent("## 🏦 CHOAM Market Board"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${truncateDiscordText(summary, 300)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(content, 2_200)))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) => row.setComponents(categoryMenu))
    .addActionRowComponents((row) => row.setComponents(first, previous, next, last))
    .addTextDisplayComponents((text) => text.setContent(`-# Live sell orders · Requested by ${session.requestedBy} · Controls expire after 15 minutes`));
}

function createErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ERROR_COLOR)
    .addTextDisplayComponents((text) => text.setContent("## 🏦 CHOAM Market Board"))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(message, 1_000)));
}

async function renderMarketBrowser(interaction: MarketInteraction, session: MarketSession, includeBanner = false): Promise<void> {
  try {
    const [response, marketConfiguration] = await Promise.all([
      container.client.duneApi.call("GET", "/api/exchange/items", {
        query: {
          q: session.search,
          category: session.category,
          owner: session.seller,
          page: session.page - 1,
          pageSize: PAGE_SIZE,
          sortColumn: "display_name",
          sortDirection: "asc",
        },
      }),
      session.buybackPercent === undefined
        ? container.client.duneApi.call("GET", "/api/exchange/market").catch((error: unknown) => {
            container.logger.warn("Unable to retrieve the Market Bot buyback configuration.", error);
            return null;
          })
        : null,
    ]);
    const market = parseMarketPage(response);

    if (session.buybackPercent === undefined) session.buybackPercent = parseBuybackPercent(marketConfiguration);
    if (market.categories.length) session.categories = market.categories;

    if (!market.available) {
      const reason = market.reason ? `\n\n${market.reason}` : "";
      await interaction.editReply({ components: [createErrorCard(`The CHOAM Exchange market is unavailable on this server.${reason}`)], allowedMentions: { parse: [] } });
      return;
    }

    session.totalPages = Math.max(1, Math.ceil(market.totalCount / PAGE_SIZE));
    session.page = Math.min(session.page, session.totalPages);

    const filters = [session.seller === "all" ? null : session.seller === "bot" ? "market bot" : "players", session.category ? `category: ${session.category}` : "all categories", session.search ? `search: ${session.search}` : null].filter(Boolean);
    const summary = [`Page ${session.page} of ${session.totalPages}`, `${market.totalCount.toLocaleString()} matching item${market.totalCount === 1 ? "" : "s"}`, session.buybackPercent === null ? "Buyback unavailable" : `${session.buybackPercent}% buyback`, filters.join(" · ")].join(" · ");
    const card = createMarketCard(formatMarketRows(market.rows, session.buybackPercent), summary, session);

    if (includeBanner) {
      const banner = createDuneBanner({
        filename: IMAGE_NAME,
        title: "CHOAM Market",
        subtitle: `${market.totalCount.toLocaleString()} ACTIVE ITEM${market.totalCount === 1 ? "" : "S"}`,
        detail: "LOWEST ASKING PRICES",
      });

      await interaction.editReply({ ...createV2Response([card], [banner]), allowedMentions: { parse: [] } });
      return;
    }

    await interaction.editReply({ content: null, embeds: [], components: [card], allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    container.logger.error("Unable to retrieve CHOAM Exchange listings.", error);
    await interaction.editReply({
      content: null,
      embeds: [],
      components: [createErrorCard("The live CHOAM Exchange market could not be retrieved. Please try again shortly.")],
      flags: includeBanner ? MessageFlags.IsComponentsV2 : undefined,
      allowedMentions: { parse: [] },
    });
  }
}

export { ALL_CATEGORIES, createMarketCard, renderMarketBrowser };
