import type { DiscordAuditLogger } from "../modules/audit/DiscordAuditLogger";
import type { DiscordAdapterClient } from "../infrastructure/http/discord-adapter/DiscordAdapterClient";
import type { ConvoyClient } from "../infrastructure/http/convoy/ConvoyClient";
import type { DuneApi } from "../infrastructure/http/dune-console/DuneApi";
import type { RateLimiter } from "../infrastructure/rate-limit/InMemoryRateLimiter";
import type { TicketRepository } from "../infrastructure/database/tickets/TicketRepository";
import type { DiscordGameChatBridge } from "../modules/chat/DiscordGameChatBridge";
import type { VoiceService } from "../modules/voice/VoiceService";
import type { MusicService } from "../modules/music/MusicService";

declare module "discord.js" {
  interface Client {
    music?: MusicService;
    voiceRooms?: VoiceService;
    chatBridge?: DiscordGameChatBridge;
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
