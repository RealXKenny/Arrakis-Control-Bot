import { ActivityType, Events } from "discord.js";
import type { BotClient } from "../../../infrastructure/core/BotApplication";

import { createLogger } from "../../../infrastructure/core/logger";
import { startAuditLogForwarder } from "../../../modules/audit/DiscordAuditLogForwarder";
import { ensureBlueprintUploadPanel } from "../../../modules/panels/blueprintUploadPanel";
import { ensurePlayerLinkPanel } from "../../../modules/panels/playerLinkPanel";
import { ensureRolePanel } from "../../../modules/panels/rolePanel";
import { ensureRulesPanel } from "../../../modules/panels/rulesPanel";
import { ensureServerInfoPanel } from "../../../modules/panels/serverInfoPanel";
import { ensureVerificationPanel } from "../../../modules/panels/verificationPanel";
import { announceCurrentVersion } from "../../../modules/panels/versionAnnouncement";

const logger = createLogger("DISCORD");

const PRESENCE_INTERVAL_MS = 30_000;
const DEFAULT_SERVER_NAME = "Dune: Awakening Community Server";
const DEFAULT_ANNOUNCEMENT_INTERVAL_MINUTES = 5;

const statuses = (
  serverName: string,
): Array<{
  name: string;
  type: ActivityType;
}> => [
  {
    name: "Watching the sands of Arrakis",
    type: ActivityType.Watching,
  },
  {
    name: `Playing ${serverName}`,
    type: ActivityType.Playing,
  },
  {
    name: "Watching the spice flow",
    type: ActivityType.Watching,
  },
  {
    name: "Watching over Arrakis",
    type: ActivityType.Watching,
  },
  {
    name: "Playing Dune: Awakening",
    type: ActivityType.Playing,
  },
];

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client: BotClient): Promise<void> {
    if (!client.user) {
      logger.error("Client reported ready, but no Discord user is available.");
      return;
    }

    const botUser = client.user;
    const serverName = process.env.SERVER_NAME || DEFAULT_SERVER_NAME;
    const presenceStatuses = statuses(serverName);

    let statusIndex = 0;

    const updatePresence = (): void => {
      const status = presenceStatuses[statusIndex];

      botUser.setPresence({
        activities: [
          {
            name: status.name,
            type: status.type,
          },
        ],
        status: "online",
      });

      statusIndex = (statusIndex + 1) % presenceStatuses.length;
    };

    updatePresence();

    client.presenceInterval = setInterval(updatePresence, PRESENCE_INTERVAL_MS);

    logger.info(`Ready! Logged in as ${botUser.tag}.`);

    client.auditLogInterval = startAuditLogForwarder(client);

    await ensurePanels(client);
    await runReadyTask("configure version announcements", () => setupVersionAnnouncements(client));
  },
};

async function ensurePanels(client: BotClient): Promise<void> {
  if (client.discordAdapter) {
    await runReadyTask("publish the player link panel", () => ensurePlayerLinkPanel(client, client.discordAdapterLinkPanelChannelId));
    await runReadyTask("publish the blueprint upload panel", () => ensureBlueprintUploadPanel(client, client.discordAdapterBlueprintPanelChannelId));
  }

  await runReadyTask("publish the role panel", () => ensureRolePanel(client, client.discordRolePanelChannelId));
  await runReadyTask("publish the verification panel", () => ensureVerificationPanel(client, client.discordVerifyChannelId));
  await runReadyTask("publish the rules panel", () => ensureRulesPanel(client, client.discordRulesChannelId));
  await runReadyTask("publish the server info panel", () => ensureServerInfoPanel(client, client.discordServerInfoChannelId));
}

async function runReadyTask(label: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error: unknown) {
    logger.error(`Unable to ${label}.`, error);
  }
}

async function setupVersionAnnouncements(client: BotClient): Promise<void> {
  const channelId = client.discordAnnouncementChannelId;

  await announceCurrentVersion(client, channelId);

  if (!channelId) {
    return;
  }

  const intervalMinutes = Math.max(Number(client.versionAnnouncementIntervalMinutes) || DEFAULT_ANNOUNCEMENT_INTERVAL_MINUTES, 1);

  client.versionAnnouncementInterval = setInterval(() => {
    announceCurrentVersion(client, channelId).catch((error: unknown) => {
      logger.error("Unable to check for new version announcements.", error);
    });
  }, intervalMinutes * 60_000);
}
