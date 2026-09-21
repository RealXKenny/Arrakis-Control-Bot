import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  type Client,
  type MessageCreateOptions,
  type MessageEditOptions,
} from "discord.js";

import { findPanelMessage } from "../../../shared/discord/findPanelMessage";
import { createDuneBanner } from "../../../shared/discord/imageFactory";

const PANEL_MARKER = "# Arrakis Control Center";
const PANEL_IMAGE_NAME = "arrakis-bot-control.png";

function buildBotControlPanel(client: Client): ContainerBuilder {
  const enabled = [
    client.discordAdapter ? "Player links" : null,
    client.chatBridge ? "Game chat" : null,
    client.voiceRooms ? "Voice rooms" : null,
    client.music ? "Music" : null,
    client.leveling ? "Leveling" : null,
  ].filter((value): value is string => Boolean(value));

  const button = (id: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`bot-control:${id}`).setLabel(label).setStyle(style);

  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
      .setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Arrakis Control secure bot operations center")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent("Monitor the bot, refresh every persistent Discord panel, reload application pieces, resynchronize runtime services, or restart all shards."))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`### Active systems\n${enabled.length ? enabled.map((name) => `✅ ${name}`).join(" · ") : "⚠️ Core Discord features only"}`))
    .addActionRowComponents((row) => row.addComponents(
      button("status", "System Status", ButtonStyle.Primary),
      button("refresh-panels", "Refresh All Panels", ButtonStyle.Success),
      button("reload", "Reload Modules"),
    ))
    .addActionRowComponents((row) => row.addComponents(
      button("resync", "Resync Services"),
      button("restart", "Restart Bot", ButtonStyle.Danger),
    ))
    .addTextDisplayComponents((text) => text.setContent("-# Restricted to the Discord server owner or configured Owner role. Restart requires a second confirmation. Every operation is recorded in the activity log."));
}

function botControlPayload(client: Client): MessageCreateOptions {
  const banner = createDuneBanner({
    artwork: "bot-control",
    filename: PANEL_IMAGE_NAME,
    title: "Bot Control",
    subtitle: "SECURE OPERATIONS",
    detail: "MONITOR • REFRESH • RESYNC • RESTART",
  });

  return {
    components: [buildBotControlPanel(client)],
    files: [banner],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function ensureBotControlPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) return;
  if (!client.user) throw new Error("Cannot create the bot control panel before the Discord client is ready.");

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable() || !("messages" in channel)) {
    throw new Error(`Bot control panel channel ${channelId} is not a sendable message channel.`);
  }

  const payload = botControlPayload(client);
  const existing = await findPanelMessage(channel, client.user.id, PANEL_MARKER);
  if (existing) {
    const editPayload: MessageEditOptions = {
      content: null,
      embeds: [],
      attachments: [],
      components: payload.components,
      files: payload.files,
      allowedMentions: payload.allowedMentions,
    };
    await existing.edit(editPayload);
    return;
  }

  await channel.send(payload);
}

export { PANEL_MARKER, buildBotControlPanel, ensureBotControlPanel };
