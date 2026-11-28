import { container } from "@sapphire/framework";
import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

import { scopedLogger } from "../../../client/logger";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import { createPanelBanner } from "../../../shared/discord/imageFactory";
import { formatDungeonPage, getDungeonSnapshot, type DungeonSnapshot } from "./dungeonLeaderboard";
import { countPages, formatLeaderboardPage, getSolariSnapshot, type SolariSnapshot } from "./solariLeaderboard";
import type { LeaderboardKind, LeaderboardSession } from "./solariLeaderboardSessions";
import { PANEL_COLORS } from "../../../shared/discord/panelStyle";

const PAGE_SIZE = 10;
const IMAGE_NAME = "solari-leaderboard.png";
const ACCENT_COLOR = PANEL_COLORS.accent;
const ERROR_COLOR = PANEL_COLORS.danger;
const TITLES: Record<LeaderboardKind, string> = { solaris: "## 💰 Solari Leaderboard", dungeons: "## 🏆 Dungeon Records" };
const TITLE = TITLES.solaris;

type LeaderboardInteraction = ChatInputCommandInteraction | ButtonInteraction;

function createLeaderboardCard(content: string, summary: string, session: LeaderboardSession): ContainerBuilder {
  const button = (action: string, label: string, disabled: boolean, style = ButtonStyle.Secondary): ButtonBuilder =>
    new ButtonBuilder().setCustomId(`leaderboard-page:${session.id}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled);

  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${IMAGE_NAME}`).setDescription(session.kind === "dungeons" ? "Dungeon records" : "Solari leaderboard")))
    .addTextDisplayComponents((text) => text.setContent(TITLES[session.kind] ?? TITLE))
    .addTextDisplayComponents((text) => text.setContent(`-# ${truncateDiscordText(summary, 300)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(content, 2_200)))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        button("first", "First", session.page <= 1),
        button("previous", "Previous", session.page <= 1),
        button("next", "Next", session.page >= session.totalPages, ButtonStyle.Primary),
        button("last", "Last", session.page >= session.totalPages),
      ),
    )
    .addTextDisplayComponents((text) => text.setContent(`-# Requested by ${truncateDiscordText(session.requestedBy, 60, "…")} · Controls expire after 15 minutes`));
}

function createErrorCard(message: string, kind: LeaderboardKind = "solaris"): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ERROR_COLOR)
    .addTextDisplayComponents((text) => text.setContent(TITLES[kind]))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(message, 1_000)));
}

function summarize(snapshot: SolariSnapshot, session: LeaderboardSession): string {
  const parts = [`Page ${session.page} of ${session.totalPages}`, `${snapshot.entries.length.toLocaleString()} player${snapshot.entries.length === 1 ? "" : "s"} ranked`];

  if (snapshot.failed > 0) parts.push(`${snapshot.failed.toLocaleString()} unavailable`);
  if (snapshot.truncated) parts.push("player list capped");
  parts.push(`updated <t:${Math.floor(snapshot.generatedAt / 1_000)}:R>`);

  return parts.join(" · ");
}

function summarizeDungeons(snapshot: DungeonSnapshot, session: LeaderboardSession): string {
  const runs = snapshot.records.reduce((sum, record) => sum + record.runCount, 0);
  return [
    `Page ${session.page} of ${session.totalPages}`,
    `${snapshot.records.length.toLocaleString()} record${snapshot.records.length === 1 ? "" : "s"}`,
    `${runs.toLocaleString()} runs counted`,
    `updated <t:${Math.floor(snapshot.generatedAt / 1_000)}:R>`,
  ].join(" · ");
}

async function renderDungeonLeaderboard(interaction: LeaderboardInteraction, session: LeaderboardSession, includeBanner: boolean): Promise<void> {
  const snapshot = await getDungeonSnapshot(container.client.duneApi);
  if (!snapshot.supported) {
    await interaction.editReply({
      content: null,
      embeds: [],
      components: [createErrorCard("This server does not report dungeon completions yet. Records appear once the Console exposes them.", "dungeons")],
      flags: includeBanner ? MessageFlags.IsComponentsV2 : undefined,
      allowedMentions: { parse: [] },
    });
    return;
  }

  session.totalPages = countPages(snapshot.records.length, PAGE_SIZE);
  session.page = Math.min(Math.max(1, session.page), session.totalPages);
  const card = createLeaderboardCard(formatDungeonPage(snapshot.records, session.page, PAGE_SIZE), summarizeDungeons(snapshot, session), session);

  if (includeBanner) {
    const banner = createPanelBanner({
      artwork: "market",
      filename: IMAGE_NAME,
      title: "Dungeon Records",
      subtitle: `${snapshot.records.length.toLocaleString()} RECORD${snapshot.records.length === 1 ? "" : "S"}`,
      detail: "Fastest run per dungeon and difficulty",
    });
    await interaction.editReply({ ...createV2Response([card], [banner]), allowedMentions: { parse: [] } });
    return;
  }

  await interaction.editReply({ content: null, embeds: [], components: [card], allowedMentions: { parse: [] } });
}

async function renderSolariLeaderboard(interaction: LeaderboardInteraction, session: LeaderboardSession, includeBanner = false): Promise<void> {
  if (session.kind === "dungeons") {
    try {
      await renderDungeonLeaderboard(interaction, session, includeBanner);
    } catch (error: unknown) {
      scopedLogger(container.logger, "PLAYERS").error("Unable to build the dungeon leaderboard.", error);
      await interaction.editReply({
        content: null,
        embeds: [],
        components: [createErrorCard("Dungeon records could not be retrieved from the Dune server. Please try again shortly.", "dungeons")],
        flags: includeBanner ? MessageFlags.IsComponentsV2 : undefined,
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  try {
    const snapshot = await getSolariSnapshot(container.client.duneApi);

    session.totalPages = countPages(snapshot.entries.length, PAGE_SIZE);
    session.page = Math.min(Math.max(1, session.page), session.totalPages);

    const card = createLeaderboardCard(formatLeaderboardPage(snapshot.entries, session.page, PAGE_SIZE), summarize(snapshot, session), session);

    if (includeBanner) {
      const banner = createPanelBanner({
        artwork: "market",
        filename: IMAGE_NAME,
        title: "Solari Leaderboard",
        subtitle: `${snapshot.entries.length.toLocaleString()} PLAYER${snapshot.entries.length === 1 ? "" : "S"} RANKED`,
        detail: "Banked Solari plus coins carried",
      });

      await interaction.editReply({ ...createV2Response([card], [banner]), allowedMentions: { parse: [] } });
      return;
    }

    await interaction.editReply({ content: null, embeds: [], components: [card], allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    scopedLogger(container.logger, "PLAYERS").error("Unable to build the Solari leaderboard.", error);
    await interaction.editReply({
      content: null,
      embeds: [],
      components: [createErrorCard("The Solari leaderboard could not be retrieved from the Dune server. Please try again shortly.")],
      flags: includeBanner ? MessageFlags.IsComponentsV2 : undefined,
      allowedMentions: { parse: [] },
    });
  }
}

export { PAGE_SIZE, createLeaderboardCard, renderSolariLeaderboard };
