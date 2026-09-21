import { Events, Listener, container } from "@sapphire/framework";
import { ActivityType } from "discord.js";

import { startAuditLogForwarder } from "../../modules/audit/DiscordAuditLogForwarder";
import { persistentPanelTasks } from "../../modules/administration/control/panelRefresh";
import { announceCurrentVersion } from "../../modules/releases/versionAnnouncement";
import { startStormAnnouncements } from "../../modules/world/storms/stormAnnouncement";
import { scopedLogger } from "../../client/logger";

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
    const gatewayLogger = scopedLogger(this.container.logger, "GATEWAY");
    const communityLogger = scopedLogger(this.container.logger, "COMMUNITY");
    const systemLogger = scopedLogger(this.container.logger, "SYSTEM");

    if (!client.user) {
      gatewayLogger.error("Client reported ready, but no Discord user is available.");
      return;
    }

    const botUser = client.user;
    // Dev note: Start the caravans only after Discord confirms the gate is open.
    client.chatBridge?.start();
    client.music?.start();
    client.leveling?.start();
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

    gatewayLogger.info(`Connected as ${botUser.tag} | ${client.guilds.cache.size} server(s).`);
    communityLogger.info("[04] Restoring voice rooms and synchronizing panels.");

    client.auditLogInterval = startAuditLogForwarder(client);
    await runReadyTask("recover temporary voice rooms", async () => { await client.voiceRooms?.start(); });
    await runReadyTask("configure storm announcements", () => {
      client.stormAnnouncementInterval = startStormAnnouncements(client);
      return Promise.resolve();
    });

    await ensurePanels();
    await runReadyTask("configure version announcements", setupVersionAnnouncements);
    systemLogger.info("[WATCH ACTIVE] Startup tasks finished. Check any service warnings above.");
  }
}

async function ensurePanels(): Promise<void> {
  const { client } = container;
  for (const task of persistentPanelTasks(client)) {
    await runReadyTask(`publish the ${task.label}`, task.run);
  }
}

async function runReadyTask(label: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error: unknown) {
    // Dev note: One broken signpost should not close every stall in the sietch.
    scopedLogger(container.logger, "COMMUNITY").error(`Unable to ${label}.`, error);
  }
}

async function setupVersionAnnouncements(): Promise<void> {
  const { client } = container;
  const channelId = client.discordAnnouncementChannelId;
  if (!channelId) return;

  const intervalMinutes = Math.max(Number(client.versionAnnouncementIntervalMinutes) || DEFAULT_ANNOUNCEMENT_INTERVAL_MINUTES, 1);
  let checking = false;
  let consecutiveFailures = 0;

  const check = async (): Promise<void> => {
    try {
      await announceCurrentVersion(client, channelId);
      if (consecutiveFailures >= 5) scopedLogger(container.logger, "RELEASES").info(`Release checks recovered after ${consecutiveFailures} failed attempts.`);
      consecutiveFailures = 0;
    } catch (error: unknown) {
      consecutiveFailures++;
      // Dev note: One dropped packet is weather; five in a row is a forecast.
      if (shouldReportReleaseFailure(consecutiveFailures)) {
        scopedLogger(container.logger, "RELEASES").error(`Release check failed ${consecutiveFailures} consecutive times.`, error);
      }
    }
  };

  await check();
  client.versionAnnouncementInterval = setInterval(() => {
    if (checking) return;
    checking = true;
    void check().finally(() => { checking = false; });
  }, intervalMinutes * 60_000);
}

function shouldReportReleaseFailure(consecutiveFailures: number): boolean {
  return consecutiveFailures >= 5 && consecutiveFailures % 5 === 0;
}

export { Ready, runReadyTask, shouldReportReleaseFailure };
