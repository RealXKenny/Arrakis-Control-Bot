import type { Client } from "discord.js";
import type { Pool } from "pg";
import { DashboardOAuthRepository } from "../infrastructure/database/dashboard/DashboardOAuthRepository";
import { DashboardRateLimitRepository } from "../infrastructure/database/dashboard/DashboardRateLimitRepository";
import { DashboardSessionRepository } from "../infrastructure/database/dashboard/DashboardSessionRepository";
import { DashboardAuthRoutes } from "../infrastructure/http/dashboard/DashboardAuthRoutes";
import { DiscordOAuthClient } from "../infrastructure/http/discord/DiscordOAuthClient";
import { DashboardAccessService } from "../modules/dashboard/dashboardAccess";
import { DashboardExpiryCleanup } from "../modules/dashboard/dashboardExpiryCleanup";
import { DashboardOAuthService } from "../modules/dashboard/dashboardOAuth";

interface DashboardSecurityConfig {
  publicOrigin: string;
  clientId: string;
  clientSecret: string;
  rateLimitSecret: string;
}

/** Compose the security services; the owning HTTP runtime starts and stops cleanup. */
export function createDashboardSecurity(client: Client, pool: Pool, config: DashboardSecurityConfig,
  onCleanupError: (name: string, error: unknown) => void) {
  const sessions = new DashboardSessionRepository(pool);
  const transactions = new DashboardOAuthRepository(pool);
  const limits = new DashboardRateLimitRepository(pool, config.rateLimitSecret);
  const identity = new DiscordOAuthClient(config.clientId, config.clientSecret, new URL("/api/auth/discord/callback", config.publicOrigin).toString());
  const oauth = new DashboardOAuthService(transactions, sessions, identity);
  const access = new DashboardAccessService(sessions, client);
  const routes = new DashboardAuthRoutes(config.publicOrigin, oauth, access, limits);
  const cleanup = new DashboardExpiryCleanup([
    { name: "sessions", store: sessions },
    { name: "OAuth transactions", store: transactions },
    { name: "rate limits", store: limits },
  ], onCleanupError);
  return { routes, cleanup };
}
