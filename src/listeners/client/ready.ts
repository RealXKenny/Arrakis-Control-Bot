import { Events, Listener, container } from "@sapphire/framework";
import { ActivityType } from "discord.js";

import { startAuditLogForwarder } from "../../modules/audit/DiscordAuditLogForwarder";
import { ensureBlueprintUploadPanel } from "../../modules/panels/blueprintUploadPanel";
import { ensurePlayerLinkPanel } from "../../modules/panels/playerLinkPanel";
import { ensureRolePanel } from "../../modules/panels/rolePanel";
import { ensureRulesPanel } from "../../modules/panels/rulesPanel";
import { ensureServerInfoPanel } from "../../modules/panels/serverInfoPanel";
import { ensureFaqPanel } from "../../modules/panels/faqPanel";
import { ensureVerificationPanel } from "../../modules/panels/verificationPanel";
import { ensureTicketPanel } from "../../modules/panels/ticketPanel";
import { announceCurrentVersion } from "../../modules/panels/versionAnnouncement";
import { startStormAnnouncements } from "../../modules/panels/stormAnnouncement";

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

class Ready extends Listener<typeof Events.ClientReady> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ClientReady, once: true });
  }

  public override async run(): Promise<void> {
    const { client } = this.container;

    if (!client.user) {
      this.container.logger.error("Client reported ready, but no Discord user is available.");
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

    this.container.logger.info(`Ready! Logged in as ${botUser.tag}.`);

    client.auditLogInterval = startAuditLogForwarder(client);
    await runReadyTask("configure storm announcements", () => {
      client.stormAnnouncementInterval = startStormAnnouncements(client);
      return Promise.resolve();
    });

    await ensurePanels();
    await runReadyTask("configure version announcements", setupVersionAnnouncements);
  }
}

async function ensurePanels(): Promise<void> {
  const { client } = container;
  if (client.discordAdapter) {
    await runReadyTask("publish the player link panel", () => ensurePlayerLinkPanel(client, client.discordAdapterLinkPanelChannelId));
    await runReadyTask("publish the blueprint upload panel", () => ensureBlueprintUploadPanel(client, client.discordAdapterBlueprintPanelChannelId));
  }

  await runReadyTask("publish the role panel", () => ensureRolePanel(client, client.discordRolePanelChannelId));
  await runReadyTask("publish the verification panel", () => ensureVerificationPanel(client, client.discordVerifyChannelId));
  await runReadyTask("publish the rules panel", () => ensureRulesPanel(client, client.discordRulesChannelId));
  await runReadyTask("publish the server info panel", () => ensureServerInfoPanel(client, client.discordServerInfoChannelId));
  await runReadyTask("publish the FAQ panel", () => ensureFaqPanel(client, client.discordFaqPanelChannelId));
  await runReadyTask("publish the ticket panel", () => ensureTicketPanel(client, client.discordTicketPanelChannelId));
}

async function runReadyTask(label: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error: unknown) {
    container.logger.error(`Unable to ${label}.`, error);
  }
}

async function setupVersionAnnouncements(): Promise<void> {
  const { client } = container;
  const channelId = client.discordAnnouncementChannelId;

  await announceCurrentVersion(client, channelId);

  if (!channelId) {
    return;
  }

  const intervalMinutes = Math.max(Number(client.versionAnnouncementIntervalMinutes) || DEFAULT_ANNOUNCEMENT_INTERVAL_MINUTES, 1);

  client.versionAnnouncementInterval = setInterval(() => {
    announceCurrentVersion(client, channelId).catch((error: unknown) => {
      container.logger.error("Unable to check for new version announcements.", error);
    });
  }, intervalMinutes * 60_000);
}

export { Ready, runReadyTask };
