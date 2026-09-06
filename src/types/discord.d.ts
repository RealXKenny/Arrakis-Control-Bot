import type { Collection } from "discord.js";

import type { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger.js";
import type { CommandModule, ComponentHandler } from "../infrastructure/core/BotApplication.js";
import type { DiscordAdapterClient } from "../infrastructure/api/DiscordAdapterClient.js";
import type { ConvoyClient } from "../infrastructure/api/ConvoyClient.js";
import type { DuneApi } from "../infrastructure/api/DuneApi.js";
import type { RateLimiter } from "../infrastructure/rateLimit/rateLimiter.js";

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
    duneApi: DuneApi;
    convoyApi: ConvoyClient | null;
    versionAnnouncementIntervalMinutes?: number;
    interactionRateLimiter: RateLimiter;
  }
}
