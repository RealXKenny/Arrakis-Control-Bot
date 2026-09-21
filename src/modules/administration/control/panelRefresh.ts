import type { Client, Guild } from "discord.js";

import { ensureBotControlPanel } from "./botControlPanel";
import { ensureFaqPanel } from "../../community/faq/faqPanel";
import { ensureRolePanel } from "../../community/roles/rolePanel";
import { ensureRulesPanel } from "../../community/rules/rulesPanel";
import { ensureVerificationPanel } from "../../community/verification/verificationPanel";
import { ensureBlueprintUploadPanel } from "../../players/blueprints/blueprintUploadPanel";
import { ensurePlayerLinkPanel } from "../../players/linking/playerLinkPanel";
import { ensureServerInfoPanel } from "../../server/information/serverInfoPanel";
import { ensureTicketPanel } from "../../tickets/ticketPanel";
import { ensureStaffApplicationPanel } from "../../community/applications/staffApplicationPanel";
import { refreshReleaseAnnouncements } from "../../releases/versionAnnouncement";
import { readStormChannelId, refreshStormAnnouncement } from "../../world/storms/stormAnnouncement";

interface PersistentPanelTask {
  label: string;
  run: () => Promise<void>;
}

interface PanelRefreshResult {
  label: string;
  status: "updated" | "failed";
  error?: string;
}

const activeRefreshes = new WeakMap<Client, Promise<PanelRefreshResult[]>>();

function persistentPanelTasks(client: Client, guild?: Guild): PersistentPanelTask[] {
  const tasks: PersistentPanelTask[] = [];
  const configured = (channelId: string | undefined, label: string, run: () => Promise<void>): void => {
    if (channelId) tasks.push({ label, run });
  };

  configured(client.discordBotControlChannelId, "bot control panel", () => ensureBotControlPanel(client, client.discordBotControlChannelId));
  configured(client.discordRolePanelChannelId, "role panel", () => ensureRolePanel(client, client.discordRolePanelChannelId));
  configured(client.discordVerifyChannelId, "verification panel", () => ensureVerificationPanel(client, client.discordVerifyChannelId));
  configured(client.discordRulesChannelId, "rules panel", () => ensureRulesPanel(client, client.discordRulesChannelId));
  configured(client.discordServerInfoChannelId, "server information panel", () => ensureServerInfoPanel(client, client.discordServerInfoChannelId));
  configured(client.discordFaqPanelChannelId, "FAQ panel", () => ensureFaqPanel(client, client.discordFaqPanelChannelId));
  configured(client.discordTicketPanelChannelId, "ticket panel", () => ensureTicketPanel(client, client.discordTicketPanelChannelId));
  configured(client.discordAnnouncementChannelId, "release announcement cards", () => refreshReleaseAnnouncements(client, client.discordAnnouncementChannelId));
  if (client.staffApplications) tasks.push({ label: "staff application panel", run: () => ensureStaffApplicationPanel(client) });

  if (client.discordAdapter) {
    configured(client.discordAdapterLinkPanelChannelId, "player link panel", () => ensurePlayerLinkPanel(client, client.discordAdapterLinkPanelChannelId));
    configured(client.discordAdapterBlueprintPanelChannelId, "blueprint upload panel", () => ensureBlueprintUploadPanel(client, client.discordAdapterBlueprintPanelChannelId));
  }
  if (client.music) tasks.push({ label: "music panel", run: () => client.music!.publishPanel() });
  if (client.voiceRooms) tasks.push({ label: "voice panel", run: () => guild ? client.voiceRooms!.panel(guild) : client.voiceRooms!.panels() });
  if (readStormChannelId()) tasks.push({ label: "storm panel", run: () => refreshStormAnnouncement(client) });

  return tasks;
}

function refreshPersistentPanels(client: Client, guild?: Guild): Promise<PanelRefreshResult[]> {
  const active = activeRefreshes.get(client);
  if (active) return active;

  const refresh = (async () => {
    const results: PanelRefreshResult[] = [];
    // Dev note: March in single file; Discord dislikes a stampede of fresh banners.
    for (const task of persistentPanelTasks(client, guild)) {
      try {
        await task.run();
        results.push({ label: task.label, status: "updated" });
      } catch (error: unknown) {
        results.push({ label: task.label, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  })();

  activeRefreshes.set(client, refresh);
  return refresh.finally(() => {
    if (activeRefreshes.get(client) === refresh) activeRefreshes.delete(client);
  });
}

export { persistentPanelTasks, refreshPersistentPanels };
export type { PanelRefreshResult, PersistentPanelTask };
