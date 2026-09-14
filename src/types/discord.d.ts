import type { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";
import type { DiscordAdapterClient } from "../infrastructure/http/discord-adapter/DiscordAdapterClient";
import type { ConvoyClient } from "../infrastructure/http/convoy/ConvoyClient";
import type { DuneApi } from "../infrastructure/http/dune-console/DuneApi";
import type { RateLimiter } from "../infrastructure/rate-limit/InMemoryRateLimiter";
import type { TicketRepository } from "../infrastructure/database/tickets/TicketRepository";

declare module "discord.js" {
  interface Client {
    auditLogger: DiscordAuditLogger;
    auditLogInterval?: NodeJS.Timeout;
    presenceInterval?: NodeJS.Timeout;
    versionAnnouncementInterval?: NodeJS.Timeout;
    stormAnnouncementInterval?: NodeJS.Timeout;
    discordAdapter: DiscordAdapterClient | null;
    discordAdapterLinkPanelChannelId?: string;
    discordAdapterBlueprintPanelChannelId?: string;
    discordRolePanelChannelId?: string;
    discordVerifyChannelId?: string;
    discordRulesChannelId?: string;
    discordServerInfoChannelId?: string;
    discordFaqPanelChannelId?: string;
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
