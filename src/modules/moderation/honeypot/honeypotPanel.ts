import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, PermissionFlagsBits, ShardClientUtil, type Client } from "discord.js";
import type { HoneypotConfig } from "../../../infrastructure/config/honeypot";
import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { findPanelMessage } from "../../../shared/discord/findPanelMessage";
import { createLogger } from "../../../client/logger";

const PANEL_MARKER = "## Honeypot — Do Not Post";
const PANEL_IMAGE_NAME = "honeypot-warning.png";
const activePublications = new WeakMap<Client, Promise<void>>();
const logger = createLogger("HONEYPOT");

function buildHoneypotPanel(config: Readonly<HoneypotConfig>, includeBanner = true): ContainerBuilder {
  const consequence = config.action === "ban"
    ? "**Posting here results in an automatic ban from this server.**"
    : config.action === "timeout"
      ? `**Posting here results in an automatic timeout for ${config.timeoutMinutes} minutes.**`
      : "**Messages posted here are removed and logged for staff review. No automatic ban or timeout is applied in the current mode.**";
  const panel = new ContainerBuilder().setAccentColor(0x8f3025);
  if (includeBanner) panel.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Honeypot channel warning")));
  return panel
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent([
      "This channel is a spam trap used to detect automated spam and compromised accounts. **Do not send messages, attachments, or test posts here.**",
      consequence,
      "Messages are removed and incidents are logged for the moderation team. Use the appropriate community or support channel instead. If you posted here by mistake, contact staff through the server's support process.",
      "Server owners, configured staff, and members with server management or moderation permissions are exempt. This warning is posted by the bot.",
    ].join("\n\n")))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("honeypot:status").setLabel("Status").setStyle(ButtonStyle.Secondary)));
}

function ensureHoneypotPanel(client: Client): Promise<void> {
  const config = client.honeypot?.config;
  if (!config) return Promise.resolve();
  const ownerShard = ShardClientUtil.shardIdForGuildId(config.guildId, client.shard?.count ?? 1);
  if (client.shard && !client.shard.ids.includes(ownerShard)) return Promise.resolve();
  if (!client.guilds.cache.has(config.guildId)) return Promise.reject(new Error("Honeypot GUILD_ID is not available on its owning shard. Check GUILD_ID and that the bot has joined the server."));
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
  const permissions = "permissionsFor" in channel ? channel.permissionsFor(client.user) : undefined;
  if (permissions !== undefined) {
    const missing = [["View Channel", PermissionFlagsBits.ViewChannel], ["Send Messages", PermissionFlagsBits.SendMessages], ["Read Message History", PermissionFlagsBits.ReadMessageHistory]] as const;
    const names = missing.filter(([, flag]) => !permissions?.has(flag)).map(([name]) => name);
    if (names.length) throw new Error(`Cannot publish honeypot panel: grant the bot ${names.join(", ")} in channel ${config.channelId}.`);
  }
  const existing = await findPanelMessage(channel, client.user.id, PANEL_MARKER);
  const files: ReturnType<typeof createDuneBanner>[] = [];
  if (permissions === undefined || permissions?.has(PermissionFlagsBits.AttachFiles)) {
    try { files.push(createDuneBanner({ artwork: "rules", filename: PANEL_IMAGE_NAME, title: "Do Not Post", subtitle: "HONEYPOT • SPAM PROTECTION", detail: "READ THE WARNING • USE COMMUNITY CHANNELS" })); }
    catch (error: unknown) { logger.error("Unable to create honeypot artwork; publishing the warning without an image.", error); }
  }
  const payload = { components: [buildHoneypotPanel(config, files.length > 0)], files, flags: MessageFlags.IsComponentsV2 as const, allowedMentions: { parse: [] as const } };
  if (existing) {
    await existing.edit({ ...payload, content: null, embeds: [], attachments: [] });
  } else {
    await channel.send(payload);
  }
  logger.info(`Honeypot warning panel ${existing ? "updated" : "published"} in channel ${config.channelId}.`);
}

export { buildHoneypotPanel, ensureHoneypotPanel };
