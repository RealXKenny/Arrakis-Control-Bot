import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createV2Response } from "../../../shared/factories/componentFactory";
import { truncateDiscordText } from "../../../shared/utils/discordLimits";
import { createDuneBanner } from "../../../shared/factories/imageFactory";
import { createLogger } from "../../../infrastructure/core/logger";

const logger = createLogger("SERVERS");

const IMAGE_NAME = "dune-vps-servers.png";
const ACCENT_COLOR = 0xc58b45;
const ERROR_COLOR = 0x8f3025;
const MAX_SERVERS_DISPLAYED = 25;

interface ServerRecord {
  name?: unknown;
  hostname?: unknown;
  server_name?: unknown;
  serverName?: unknown;
  uuid?: unknown;
  id?: unknown;

  state?: unknown;
  power_state?: unknown;
  powerState?: unknown;
  status?: unknown;
  status_name?: unknown;

  address?: unknown;
  ip?: unknown;
  primary_ip?: unknown;
  primaryIp?: unknown;
  ip_address?: unknown;
  ipAddress?: unknown;

  location?: unknown;
  datacenter?: unknown;
  data_center?: unknown;
  region?: unknown;

  [key: string]: unknown;
}

interface ErrorDetails {
  message: string;
  status: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isServerRecord(value: unknown): value is ServerRecord {
  return isRecord(value);
}

function getString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return "Unknown";
}

function getStringOrNull(...values: unknown[]): string | null {
  const value = getStringOrNullValue(values);

  return value;
}

function getStringOrNullValue(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return null;
}

function parseServers(response: unknown): ServerRecord[] {
  if (Array.isArray(response)) {
    return response.filter(isServerRecord);
  }

  if (!isRecord(response)) {
    return [];
  }

  const data = response.data;

  if (Array.isArray(data)) {
    return data.filter(isServerRecord);
  }

  const servers = response.servers;

  if (Array.isArray(servers)) {
    return servers.filter(isServerRecord);
  }

  return [];
}

function escapeDiscordText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("*", "\\*").replaceAll("_", "\\_").replaceAll("`", "\\`").replaceAll("~", "\\~").replaceAll("|", "\\|");
}

function escapeCode(value: string): string {
  return value.replaceAll("`", "'");
}

function formatServer(server: ServerRecord): string {
  const name = getString(server.name, server.hostname, server.server_name, server.serverName, server.uuid, server.id);

  const state = getString(server.state, server.power_state, server.powerState, server.status, server.status_name);

  const address = getStringOrNull(server.address, server.ip, server.primary_ip, server.primaryIp, server.ip_address, server.ipAddress);

  const location = getStringOrNull(server.location, server.datacenter, server.data_center, server.region);

  const details = [`Status: **${escapeDiscordText(state)}**`, address ? `Address: \`${escapeCode(address)}\`` : null, location ? `Location: **${escapeDiscordText(location)}**` : null].filter((value): value is string => value !== null);

  return [`💻 **${escapeDiscordText(name)}**`, details.join(" · ")].join("\n");
}

function getErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      message: getSafeErrorMessage(error),
      status: getErrorStatus(error),
    };
  }

  if (isRecord(error)) {
    return {
      message: "The external service returned an unexpected error.",
      status: typeof error.status === "number" ? error.status : null,
    };
  }

  return {
    message: "Unknown error",
    status: null,
  };
}

function getSafeErrorMessage(error: Error): string {
  const status = getErrorStatus(error);

  if (status === 401 || status === 403) return "The external service denied access.";
  if (status === 404) return "The external service could not find the requested resource.";
  if (status !== null && status >= 500) return "The external service is temporarily unavailable.";
  if (status === 0) return "The external service could not be reached.";

  return "The external service returned an error.";
}

function getErrorStatus(error: Error): number | null {
  const status = "status" in error ? error.status : null;

  return typeof status === "number" ? status : null;
}

function createServersCard(servers: ServerRecord[]): ContainerBuilder {
  const lines = servers.length ? servers.slice(0, MAX_SERVERS_DISPLAYED).map(formatServer) : ["No VPS servers were found on this account."];

  const card = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${IMAGE_NAME}`).setDescription("Advin VPS servers")))
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Advin VPS Servers"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${servers.length} server${servers.length === 1 ? "" : "s"} found`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(lines.join("\n\n"), 3_200)));

  if (servers.length > MAX_SERVERS_DISPLAYED) {
    card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent(`-# Showing ${MAX_SERVERS_DISPLAYED} of ${servers.length} servers.`));
  }

  return card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((text) => text.setContent("-# Spice flows through Arrakis • Convoy Control"));
}

function createErrorCard(error: ErrorDetails): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ERROR_COLOR)
    .addTextDisplayComponents((text) => text.setContent("## 🏜️ Advin VPS Servers"))
    .addTextDisplayComponents((text) => text.setContent("-# Convoy Control Panel"))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(truncateDiscordText(
        ["### 🔴 Servers Unavailable", "The Advin VPS server information could not be retrieved.", "", `**Error:** \`${escapeCode(error.message)}\``, error.status !== null ? `**HTTP Status:** \`${error.status}\`` : null]
          .filter((value): value is string => value !== null)
          .join("\n"), 1_000)),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("-# Spice flows through Arrakis • Convoy Control"));
}

module.exports = {
  data: new SlashCommandBuilder().setName("servers").setDescription("List your Advin VPS servers."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const { client } = interaction;

    if (!client.convoyApi) {
      await interaction.editReply("The Advin VPS integration is not configured. Set API_KEY and restart the bot.");
      return;
    }

    try {
      const response: unknown = await client.convoyApi.request("GET", "/api/client/servers");

      const servers = parseServers(response);

      const card = createServersCard(servers);

      const banner = createDuneBanner({
        filename: IMAGE_NAME,
        title: "Advin VPS",
        subtitle: `${servers.length} SERVER${servers.length === 1 ? "" : "S"}`,
        detail: "CONVOY CONTROL PANEL",
      });

      await interaction.editReply({
        ...createV2Response([card], [banner]),
        allowedMentions: {
          parse: [],
        },
      });
    } catch (error: unknown) {
      const errorDetails = getErrorDetails(error);

      logger.error(`Unable to retrieve Advin VPS servers. ${errorDetails.message}`, error);

      await interaction.editReply({
        content: null,
        embeds: [],
        components: [createErrorCard(errorDetails)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: {
          parse: [],
        },
      });
    }
  },
};
