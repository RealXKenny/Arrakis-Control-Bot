import { AuditLogEvent, type Client } from "discord.js";

import { createLogger } from "../../client/logger";

const logger = createLogger("DISCORD AUDIT LOG");

const POLL_INTERVAL_MS = 30_000;

interface AuditLogger {
  activityChannelId?: string;
  sendTo(channelId: string, title: string, lines: string[]): Promise<unknown>;
}

type AuditClient = Client & {
  auditLogger?: AuditLogger;
};

function startAuditLogForwarder(client: AuditClient): NodeJS.Timeout {
  const seenEntries = new Set<string>();
  let initialized = false;
  let polling = false;

  const poll = async (): Promise<void> => {
    if (polling) {
      logger.debug("Skipping audit log poll because the previous poll is still running.");
      return;
    }

    polling = true;

    try {
      const channelId = client.auditLogger?.activityChannelId;

      if (!channelId) return;

      for (const guild of client.guilds.cache.values()) {
        try {
          const auditLogs = await guild.fetchAuditLogs({
            limit: 20,
          });

          const entries = [...auditLogs.entries.values()];

          if (!initialized) {
            entries.forEach((entry) => {
              seenEntries.add(entry.id);
            });

            continue;
          }

          for (const entry of entries.reverse()) {
            if (seenEntries.has(entry.id)) continue;

            seenEntries.add(entry.id);

            await client.auditLogger?.sendTo(channelId, "Discord audit log", [
              `**Action:** ${formatAction(entry.action)}`,
              `**User:** ${formatUser(entry.executor)}`,
              `**Target:** ${formatTarget(entry.target)}`,
              `**Reason:** ${entry.reason ?? "Not provided"}`,
              `**Guild:** ${guild.name}`,
            ]);
          }

          while (seenEntries.size > 500) {
            const oldestEntry = seenEntries.values().next().value;

            if (oldestEntry) {
              seenEntries.delete(oldestEntry);
            }
          }
        } catch (error: unknown) {
          logger.warn(`Unable to read audit logs for ${guild.name}.`, error);
        }
      }

      initialized = true;
    } finally {
      polling = false;
    }
  };

  void poll();

  return setInterval(poll, POLL_INTERVAL_MS);
}

function formatUser(user: unknown): string {
  if (!user || typeof user !== "object") {
    return "Unknown";
  }

  const value = user as {
    tag?: unknown;
    id?: unknown;
  };

  if (typeof value.tag === "string") {
    return value.tag;
  }

  if (typeof value.id === "string") {
    return value.id;
  }

  return "Unknown";
}

function formatTarget(target: unknown): string {
  if (!target || typeof target !== "object") {
    return "Unknown";
  }

  const value = target as {
    tag?: unknown;
    name?: unknown;
    id?: unknown;
  };

  if (typeof value.tag === "string") {
    return value.tag;
  }

  if (typeof value.name === "string") {
    return value.name;
  }

  if (typeof value.id === "string") {
    return value.id;
  }

  return "Unknown";
}

function formatAction(action: AuditLogEvent): string {
  const name = Object.entries(AuditLogEvent).find(([, value]) => value === action)?.[0];

  return name ?? `Event ${action}`;
}

export { startAuditLogForwarder };
