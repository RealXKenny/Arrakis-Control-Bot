import { randomBytes } from "node:crypto";
import type { DashboardAccessResult } from "./dashboardAccess";

export interface FrameworkSession {
  platform: "discord";
  userId: string;
  spaces: { id: string }[];
}

interface Access {
  authorize(token: string | undefined, guildId: string): Promise<DashboardAccessResult>;
}

/** Request-scoped grants for framework handlers with synchronous session reads.
 * The framework loses async context during in-process dispatch, so each
 * authorized request receives a random single-request grant that the gateway
 * passes as the framework session cookie. Grants never leave this process.
 */
export class FrameworkAuthorization {
  private readonly grants = new Map<string, FrameworkSession>();
  public constructor(private readonly access: Access) {}

  /** Returns the session only while its authorized request is in flight. */
  public get(grant?: string): FrameworkSession | undefined {
    return grant ? this.grants.get(grant) : undefined;
  }

  public async run<T>(token: string | undefined, guildId: string, handler: (grant: string) => Promise<T>): Promise<
    { status: "authorized"; userId: string; value: T } | { status: "unauthenticated" | "forbidden" | "unavailable" }
  > {
    const result = await this.access.authorize(token, guildId);
    if (result.status !== "authorized") return result;
    const grant = randomBytes(32).toString("base64url");
    this.grants.set(grant, { platform: "discord", userId: result.userId, spaces: [{ id: guildId }] });
    try {
      return { status: "authorized", userId: result.userId, value: await handler(grant) };
    } finally {
      this.grants.delete(grant);
    }
  }
}
