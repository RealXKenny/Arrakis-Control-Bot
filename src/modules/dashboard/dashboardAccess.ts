import type { Client } from "discord.js";
import type { DashboardSessionRepository } from "../../infrastructure/database/dashboard/DashboardSessionRepository";
import { authorizeDashboardGuild } from "./guildAuthorization";

export type DashboardAccessResult =
  | { status: "authorized"; userId: string }
  | { status: "unauthenticated" | "forbidden" | "unavailable" };

/** Resolves the session and checks current guild permissions for each request. */
export class DashboardAccessService {
  public constructor(
    private readonly sessions: Pick<DashboardSessionRepository, "getUserId" | "revoke">,
    private readonly client: Client,
  ) {}

  public async authorize(token: string | undefined, guildId: string): Promise<DashboardAccessResult> {
    if (!token) return { status: "unauthenticated" };
    try {
      const userId = await this.sessions.getUserId(token);
      if (!userId) return { status: "unauthenticated" };
      const decision = await authorizeDashboardGuild(this.client, guildId, userId);
      if (decision === "allowed") return { status: "authorized", userId };
      return { status: decision === "denied" ? "forbidden" : "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  }

  public async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revoke(token);
  }
}
