import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DashboardOAuthRepository } from "../../infrastructure/database/dashboard/DashboardOAuthRepository";
import type { DashboardSessionRepository } from "../../infrastructure/database/dashboard/DashboardSessionRepository";

interface DashboardIdentityProvider {
  authorizationUrl(state: string, challenge: string): string;
  exchangeCode(code: string, verifier: string): Promise<string>;
}

/** Coordinates browser-bound, single-use OAuth transactions and durable sessions. */
export class DashboardOAuthService {
  public constructor(
    private readonly transactions: Pick<DashboardOAuthRepository, "create" | "consume">,
    private readonly sessions: Pick<DashboardSessionRepository, "create">,
    private readonly identity: DashboardIdentityProvider,
  ) {}

  public async begin(): Promise<{ state: string; url: string }> {
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const url = this.identity.authorizationUrl(state, challenge);
    await this.transactions.create(state, verifier);
    return { state, url };
  }

  public async complete(state: string, cookieState: string, code: string): Promise<string> {
    const valid = /^[A-Za-z0-9_-]{43}$/;
    if (!valid.test(state) || !valid.test(cookieState) || !code || code.length > 2048 ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
      throw new Error("Invalid OAuth callback");
    }
    const verifier = await this.transactions.consume(state);
    if (!verifier) throw new Error("OAuth transaction expired or already used");
    const userId = await this.identity.exchangeCode(code, verifier);
    return this.sessions.create(userId, 7 * 24 * 60 * 60);
  }
}
