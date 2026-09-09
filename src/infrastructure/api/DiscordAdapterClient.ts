import { URL } from "node:url";
import { createLogger } from "../../client/logger";

const logger = createLogger("DISCORD ADAPTER");

interface DiscordAdapterActor {
  userId?: string;
  commandName?: string;
}

interface DiscordAdapterRequestBody {
  actor?: DiscordAdapterActor;
  characterName?: string;
  code?: string;
  [key: string]: unknown;
}

interface DiscordAdapterPlayerState {
  linked?: boolean;
  message?: string | null;
  pawnId?: string | number | null;
  controllerId?: string | number | null;
  characterName?: string | null;
  onlineStatus?: string | null;
  online?: boolean;
}

interface DiscordAdapterMutationResult {
  ok?: boolean;
  message?: string | null;
  error?: string | null;
  characterName?: string | null;
  character_name?: string | null;
  onlineStatus?: string | boolean | null;
  online_status?: string | boolean | null;
  expiresInSeconds?: number | null;
  controllerId?: string | number | null;
}

interface DiscordAdapterErrorDetails {
  cause?: string;
  [key: string]: unknown;
}

class DiscordAdapterClient {
  public readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) {
      throw new Error("CONSOLE_URL is required for the Discord Adapter.");
    }

    if (!token) {
      throw new Error("ADAPTER_TOKEN is required for the Discord Adapter.");
    }

    this.baseUrl = new URL(baseUrl).toString();
    this.token = token;
  }

  async linkPlayer(actor: DiscordAdapterActor, characterName: string): Promise<DiscordAdapterMutationResult> {
    return toMutationResult(
      await this.request("/api/integrations/discord/players/link", {
        actor,
        characterName,
      }),
    );
  }

  async verifyPlayerLink(actor: DiscordAdapterActor, code: string): Promise<DiscordAdapterMutationResult> {
    return toMutationResult(
      await this.request("/api/integrations/discord/players/link/verify", {
        actor,
        code,
      }),
    );
  }

  async unlinkPlayer(actor: DiscordAdapterActor): Promise<DiscordAdapterMutationResult> {
    return toMutationResult(await this.request("/api/integrations/discord/players/unlink", { actor }));
  }

  async getCurrentPlayer(actor: DiscordAdapterActor): Promise<DiscordAdapterPlayerState | null> {
    return toPlayerState(await this.request("/api/integrations/discord/players/me", { actor }));
  }

  private async request(route: string, body: DiscordAdapterRequestBody = {}): Promise<unknown> {
    const startedAt = Date.now();

    logger.debug(`POST ${route} requested.`, {
      bodyFields: Object.keys(body),
      hasActor: Boolean(body.actor),
      userId: body.actor?.userId ?? null,
      commandName: body.actor?.commandName ?? null,
    });

    let response: Response;

    try {
      response = await fetch(new URL(route, this.baseUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error: unknown) {
      logger.error(`POST ${route} network request failed after ${Date.now() - startedAt}ms.`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorCause = error instanceof Error ? error.name : "unknown";

      throw new DiscordAdapterError(`Discord Adapter network request failed: ${errorMessage}`, 0, {
        cause: errorCause,
      });
    }

    const data = await readResponse(response);

    if (!response.ok) {
      logger.warn(`POST ${route} failed with HTTP ${response.status} after ${Date.now() - startedAt}ms.`);

      throw new DiscordAdapterError(getErrorMessage(data, response.status), response.status, data);
    }

    logger.debug(`POST ${route} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms.`);

    return data;
  }
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return response.text();
  }

  try {
    return await response.json();
  } catch {
    throw new DiscordAdapterError(`Discord Adapter returned invalid JSON with HTTP ${response.status}.`, response.status, null);
  }
}

function getErrorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;

    if (typeof record.error === "string") {
      return record.error;
    }

    if (typeof record.reason === "string") {
      return record.reason;
    }
  }

  return `Adapter request failed with HTTP ${status}.`;
}

class DiscordAdapterError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);

    this.name = "DiscordAdapterError";

    this.status = status;
    this.details = details;

    Object.setPrototypeOf(this, DiscordAdapterError.prototype);
  }
}

function toMutationResult(value: unknown): DiscordAdapterMutationResult {
  const record = toRecord(value);

  return {
    ok: typeof record.ok === "boolean" ? record.ok : undefined,
    message: toNullableString(record.message),
    error: toNullableString(record.error),
    characterName: toNullableString(record.characterName),
    character_name: toNullableString(record.character_name),
    onlineStatus: toNullableStatus(record.onlineStatus),
    online_status: toNullableStatus(record.online_status),
    expiresInSeconds: toNullableNumber(record.expiresInSeconds),
    controllerId: toPlayerId(record.controllerId),
  };
}

function toPlayerState(value: unknown): DiscordAdapterPlayerState | null {
  const record = toRecord(value);

  if (Object.keys(record).length === 0) {
    return null;
  }

  return {
    linked: typeof record.linked === "boolean" ? record.linked : undefined,
    message: toNullableString(record.message),
    pawnId: toPlayerId(record.pawnId),
    controllerId: toPlayerId(record.controllerId),
    characterName: typeof record.characterName === "string" ? record.characterName : null,
    onlineStatus: typeof record.onlineStatus === "string" ? record.onlineStatus : null,
    online: typeof record.online === "boolean" ? record.online : undefined,
  };
}

function toPlayerId(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableStatus(value: unknown): string | boolean | null {
  return typeof value === "string" || typeof value === "boolean" ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export { DiscordAdapterClient, DiscordAdapterError };
export type { DiscordAdapterActor, DiscordAdapterRequestBody, DiscordAdapterErrorDetails, DiscordAdapterMutationResult, DiscordAdapterPlayerState };
