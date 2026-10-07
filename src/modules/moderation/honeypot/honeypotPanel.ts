import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client } from "discord.js";
import type { HoneypotConfig } from "../../../infrastructure/config/honeypot";
import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { findPanelMessage } from "../../../shared/discord/findPanelMessage";

const PANEL_MARKER = "## Honeypot — Do Not Post";
const PANEL_IMAGE_NAME = "honeypot-warning.png";
const activePublications = new WeakMap<Client, Promise<void>>();

function buildHoneypotPanel(config: Readonly<HoneypotConfig>): ContainerBuilder {
  const consequence = config.action === "ban"
    ? "**Posting here results in an automatic ban from this server.**"
    : config.action === "timeout"
      ? `**Posting here results in an automatic timeout for ${config.timeoutMinutes} minutes.**`
      : "**Messages posted here are removed and logged for staff review. No automatic ban or timeout is applied in the current mode.**";
  return new ContainerBuilder()
    .setAccentColor(0x8f3025)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Honeypot channel warning")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent([
      "This channel is a spam trap used to detect automated spam and compromised accounts. **Do not send messages, attachments, or test posts here.**",
      consequence,
      "Messages are removed and incidents are logged for the moderation team. Use the appropriate community or support channel instead. If you posted here by mistake, contact staff through the server's support process.",
      "Server owners, configured staff, and members with server management or moderation permissions are exempt. This warning is posted by the bot.",
    ].join("\n\n")));
}

function ensureHoneypotPanel(client: Client): Promise<void> {
  const config = client.honeypot?.config;
  if (!config || !client.guilds.cache.has(config.guildId)) return Promise.resolve();
  const active = activePublications.get(client);
  if (active) return active;
  const publication = publishHoneypotPanel(client, config);
  activePublications.set(client, publication);
  return publication.finally(() => {
    if (activePublications.get(client) === publication) activePublications.delete(client);
  });
}

async function publishHoneypotPanel(client: Client, config: Readonly<HoneypotConfig>): Promise<void> {
  if (!client.user) throw new Error("Cannot create the honeypot panel before the Discord client is ready.");
  const channel = await client.channels.fetch(config.channelId);
  if (!channel || !("guildId" in channel) || channel.guildId !== config.guildId || !channel.isSendable()) throw new Error("Honeypot panel channel must be sendable and belong to the configured guild.");
  const existing = await findPanelMessage(channel, client.user.id, PANEL_MARKER);
  const banner = createDuneBanner({ artwork: "rules", filename: PANEL_IMAGE_NAME, title: "Do Not Post", subtitle: "HONEYPOT • SPAM PROTECTION", detail: "READ THE WARNING • USE COMMUNITY CHANNELS" });
  const payload = { components: [buildHoneypotPanel(config)], files: [banner], flags: MessageFlags.IsComponentsV2 as const, allowedMentions: { parse: [] as const } };
  if (existing) {
    await existing.edit({ ...payload, content: null, embeds: [], attachments: [] });
  } else {
    await channel.send(payload);
  }
}

export { buildHoneypotPanel, ensureHoneypotPanel };
