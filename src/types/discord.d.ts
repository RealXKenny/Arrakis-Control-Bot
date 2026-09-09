import type { Collection } from "discord.js";

import type { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";
import type { CommandModule, ComponentHandler } from "../infrastructure/core/BotApplication";
import type { DiscordAdapterClient } from "../infrastructure/api/DiscordAdapterClient";
import type { ConvoyClient } from "../infrastructure/api/ConvoyClient";
import type { DuneApi } from "../infrastructure/api/DuneApi";
import type { RateLimiter } from "../infrastructure/rateLimit/rateLimiter";
import type { TicketRepository } from "../infrastructure/database/TicketRepository";

declare module "discord.js" {
  interface Client {
    commands: Collection<string, CommandModule>;
    buttons: Collection<string, ComponentHandler>;
    selectMenus: Collection<string, ComponentHandler>;
    modals: Collection<string, ComponentHandler>;
    auditLogger: DiscordAuditLogger;
    auditLogInterval?: NodeJS.Timeout;
    presenceInterval?: NodeJS.Timeout;
    versionAnnouncementInterval?: NodeJS.Timeout;
    discordAdapter: DiscordAdapterClient | null;
    discordAdapterLinkPanelChannelId?: string;
    discordAdapterBlueprintPanelChannelId?: string;
    discordRolePanelChannelId?: string;
    discordVerifyChannelId?: string;
    discordRulesChannelId?: string;
    discordServerInfoChannelId?: string;
    discordAnnouncementChannelId?: string;
    discordTicketPanelChannelId?: string;
    discordTicketCategoryId?: string;
    discordTicketTranscriptChannelId?: string;
    duneApi: DuneApi;
    convoyApi: ConvoyClient | null;
    versionAnnouncementIntervalMinutes?: number;
    interactionRateLimiter: RateLimiter;
    tickets: TicketRepository | null;
  }
}
