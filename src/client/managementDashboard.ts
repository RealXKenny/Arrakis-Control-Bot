import type { Client } from "discord.js";
import type { Pool } from "pg";
import type { ManagementDashboardConfig } from "../infrastructure/config/managementDashboard";
import { createDashboardFramework, type DashboardFramework } from "../infrastructure/http/dashboard/DashboardFramework";
import { DashboardFrameworkGateway } from "../infrastructure/http/dashboard/DashboardFrameworkGateway";
import { DashboardHttpServer } from "../infrastructure/http/dashboard/DashboardHttpServer";
import { listDashboardGuilds, listDashboardResources, type DashboardResourceFilter } from "../modules/dashboard/dashboardGuilds";
import { DASHBOARD_SETTINGS } from "../modules/dashboard/dashboardSettings";
import { createDashboardSecurity } from "./dashboardSecurity";
import type { Logger } from "./logger";

export interface ManagementDashboard {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** The bound port while running. */
  port(): number | undefined;
}

/** Composes the framework, gateway, security services and listener. Run it in one process only. */
export function createManagementDashboard(client: Client, pool: Pool, config: ManagementDashboardConfig, logger: Logger,
  frameworkFactory = createDashboardFramework): ManagementDashboard {
  const security = createDashboardSecurity(client, pool, config, (name, error) => logger.error(`Unable to purge expired dashboard ${name}.`, error));
  let framework: DashboardFramework | undefined;
  let server: DashboardHttpServer | undefined;
  let stopping: Promise<void> | undefined;

  return {
    async start() {
      if (framework) return;
      await security.settings.initialize();
      framework = await frameworkFactory({
        publicOrigin: config.publicOrigin,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        settings: DASHBOARD_SETTINGS,
        store: security.settings,
        source: {
          resources: (guildId, kind, filter) => kind === "channel" || kind === "role"
            ? listDashboardResources(client, guildId, kind, isRecord(filter) ? filter as DashboardResourceFilter : {})
            : Promise.resolve([]),
          // The gateway authorizes every request; the framework never decides access.
          memberPermissions: () => Promise.resolve([]),
        },
        session: (grant) => security.frameworkAuthorization.get(grant),
      });
      const activeFramework = framework;
      const gateway = new DashboardFrameworkGateway({
        publicOrigin: config.publicOrigin,
        authorization: security.frameworkAuthorization,
        identity: security.access,
        guilds: { list: (userId) => listDashboardGuilds(client, userId) },
        audit: { record: (entry) => security.settings.record(entry), list: (guildId) => security.settings.list(guildId) },
        limits: security.limits,
        dispatch: (request) => activeFramework.dispatch(request),
        onError: (message, error) => logger.error(message, error),
      });
      server = new DashboardHttpServer(config.publicOrigin,
        [(request, address) => security.routes.handle(request, address), (request, address) => gateway.handle(request, address)],
        ({ method, path, status, durationMs }) => logger.debug(`${method} ${path} ${status} ${durationMs}ms`),
        (error) => logger.error("Dashboard request failed.", error));
      await server.listen(config.port, config.host);
      security.cleanup.start();
      void security.cleanup.run();
      logger.info(`Management dashboard listening on ${config.host}:${config.port} for ${config.publicOrigin}.`);
    },
    port: () => server?.port,
    async stop() {
      stopping ??= (async () => {
        try {
          await server?.close();
        } finally {
          try {
            await security.cleanup.stop();
          } finally {
            await framework?.close();
          }
        }
      })();
      await stopping;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
