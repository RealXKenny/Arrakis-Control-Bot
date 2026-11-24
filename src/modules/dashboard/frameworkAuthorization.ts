import { AsyncLocalStorage } from "node:async_hooks";
import type { DashboardAccessResult } from "./dashboardAccess";

interface FrameworkSession {
  platform: "discord";
  userId: string;
  spaces: { id: string }[];
}

interface Access {
  authorize(token: string | undefined, guildId: string): Promise<DashboardAccessResult>;
}

/** Request-local bridge for framework handlers with synchronous session reads.
 * The HTTP boundary must call run for every framework request and reject all
 * other framework routes. Never expose the framework server directly.
 */
export class FrameworkAuthorization {
  private readonly context = new AsyncLocalStorage<FrameworkSession>();
  public constructor(private readonly access: Access) {}

  /** Only the current authorized request can see its synthetic session. */
  public get(id?: string): FrameworkSession | undefined {
    void id;
    return this.context.getStore();
  }

  public async run<T>(token: string | undefined, guildId: string, handler: () => Promise<T>): Promise<
    { status: "authorized"; value: T } | { status: "unauthenticated" | "forbidden" | "unavailable" }
  > {
    const result = await this.access.authorize(token, guildId);
    if (result.status !== "authorized") return result;
    const session: FrameworkSession = { platform: "discord", userId: result.userId, spaces: [{ id: guildId }] };
    const value = await this.context.run(session, handler);
    return { status: "authorized", value };
  }
}
