import "@sapphire/plugin-subcommands/register";

import path from "node:path";
import { SapphireClient } from "@sapphire/framework";
import type { ClientOptions } from "discord.js";

import type { ConvoyClient } from "../infrastructure/api/ConvoyClient";
import type { DiscordAdapterClient } from "../infrastructure/api/DiscordAdapterClient";
import type { DuneApi } from "../infrastructure/api/DuneApi";
import type { TicketRepository } from "../infrastructure/database/TicketRepository";
import type { RateLimiter } from "../infrastructure/rateLimit/rateLimiter";
import type { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";

const PIECES_DIRECTORY = path.join(__dirname, "..");

type ArrakisClientOptions = ClientOptions & { baseUserDirectory?: string };

class ArrakisClient extends SapphireClient {
  public duneApi!: DuneApi;
  public convoyApi: ConvoyClient | null = null;
  public discordAdapter: DiscordAdapterClient | null = null;
  public discordAdapterLinkPanelChannelId?: string;
  public discordAdapterBlueprintPanelChannelId?: string;
  public discordRolePanelChannelId?: string;
  public discordVerifyChannelId?: string;
  public discordRulesChannelId?: string;
  public discordServerInfoChannelId?: string;
  public discordAnnouncementChannelId?: string;
  public discordTicketPanelChannelId?: string;
  public discordTicketCategoryId?: string;
  public discordTicketTranscriptChannelId?: string;
  public versionAnnouncementIntervalMinutes?: number;
  public auditLogger!: DiscordAuditLogger;
  public auditLogInterval?: NodeJS.Timeout;
  public versionAnnouncementInterval?: NodeJS.Timeout;
  public presenceInterval?: NodeJS.Timeout;
  public interactionRateLimiter!: RateLimiter;
  public tickets: TicketRepository | null = null;

  public constructor(options: ArrakisClientOptions) {
    const { baseUserDirectory = PIECES_DIRECTORY, ...clientOptions } = options;

    super({
      ...clientOptions,
      baseUserDirectory,
      defaultPrefix: null,
      loadMessageCommandListeners: false,
    });

    this.stores.get("commands").registerPath(path.join(baseUserDirectory, "commands"));
    this.stores.get("interaction-handlers").registerPath(path.join(baseUserDirectory, "interaction-handlers"));
    this.stores.get("listeners").registerPath(path.join(baseUserDirectory, "listeners"));
    this.stores.get("preconditions").registerPath(path.join(baseUserDirectory, "preconditions"));
  }
}

export { PIECES_DIRECTORY, ArrakisClient };
export type { ArrakisClientOptions };
