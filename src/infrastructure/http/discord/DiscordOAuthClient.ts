const MAX_RESPONSE_BYTES = 32_768;
const ID = /^[1-9]\d{16,19}$/;

/** Discord identity-only OAuth transport. Access tokens are kept in memory for one request. */
export class DiscordOAuthClient {
  public constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {
    const url = new URL(redirectUri);
    if (!ID.test(clientId) || !clientSecret || url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
      throw new Error("Invalid Discord OAuth configuration");
    }
  }

  public authorizationUrl(state: string, challenge: string): string {
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, response_type: "code",
      scope: "identify", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
    return url.toString();
  }

  public async exchangeCode(code: string, verifier: string): Promise<string> {
    const body = new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: "authorization_code",
      code, redirect_uri: this.redirectUri, code_verifier: verifier });
    const token = await readJson(await fetch("https://discord.com/api/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      redirect: "error", signal: AbortSignal.timeout(10_000),
    }));
    if (!isRecord(token) || typeof token.access_token !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(token.access_token) ||
        typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer") {
      throw new Error("Invalid Discord OAuth response");
    }
    const user = await readJson(await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }, redirect: "error", signal: AbortSignal.timeout(10_000),
    }));
    if (!isRecord(user) || typeof user.id !== "string" || !ID.test(user.id)) throw new Error("Invalid Discord identity");
    return user.id;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("Discord OAuth service unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error("Discord OAuth response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new Error("Invalid Discord OAuth response"); }
}
