import { URL } from "node:url";
import { createLogger } from "../../../client/logger";
import { MAX_BLUEPRINT_BYTES, validateBlueprintUpload } from "../../../modules/validators/blueprintValidator";

const logger = createLogger("DUNE API");
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface RequestOptions {
  routeParams?: Record<string, string | number | boolean>;

  query?: Record<string, string | number | boolean | null | undefined>;

  body?: unknown;
}

interface ApiResponseObject {
  [key: string]: unknown;
}

interface BlueprintAttachment {
  url: string;
  name: string;
  size?: number;
}

class DuneConsoleClient {
  public readonly baseUrl: string;

  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    if (!baseUrl) {
      throw new Error("CONSOLE_URL is required to create a Dune console client.");
    }

    const normalizedApiKey = apiKey?.trim();
    if (!normalizedApiKey) {
      throw new Error("CONSOLE_API_KEY is required to create a Dune Console client.");
    }

    const parsedBaseUrl = new URL(baseUrl);
    if (parsedBaseUrl.username || parsedBaseUrl.password) {
      throw new Error("CONSOLE_URL must not contain embedded credentials.");
    }

    this.baseUrl = parsedBaseUrl.toString();
    this.apiKey = normalizedApiKey;
  }

  async uploadBlueprint(playerId: string | number, attachment: BlueprintAttachment): Promise<unknown> {
    if (!attachment?.url || !attachment?.name) {
      throw new Error("A valid blueprint attachment is required.");
    }

    if (!Number.isFinite(Number(playerId)) || Number(playerId) <= 0) {
      throw new Error("A valid linked player ID is required.");
    }

    if (attachment.size !== undefined && attachment.size > MAX_BLUEPRINT_BYTES) {
      throw new Error("Blueprint files must be 32 MB or smaller.");
    }

    const attachmentUrl = validateDiscordAttachmentUrl(attachment.url);
    const fileResponse = await fetch(attachmentUrl, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!fileResponse.ok) {
      throw new Error(`Unable to download the uploaded blueprint (HTTP ${fileResponse.status}).`);
    }

    const contentLength = Number(fileResponse.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_BLUEPRINT_BYTES) {
      throw new Error("Blueprint files must be 32 MB or smaller.");
    }

    const fileBuffer = await readBoundedBody(fileResponse, MAX_BLUEPRINT_BYTES);

    validateBlueprintUpload(attachment, fileBuffer);

    const form = new FormData();

    form.set("player_id", String(playerId));

    form.set(
      "file",
      new Blob([Uint8Array.from(fileBuffer)], {
        type: "application/json",
      }),
      attachment.name,
    );

    return this.requestMultipart("POST", "/api/blueprints/import", form);
  }

  async request(method: HttpMethod, route: string, options: RequestOptions = {}): Promise<unknown> {
    const { query, body } = options;

    const url = resolveConsoleUrl(route, this.baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const startedAt = Date.now();

    logger.debug(`${method} ${route} requested.`, {
      query: query ? Object.keys(query) : [],
      hasBody: body !== undefined,
      authenticationMode: "api-key",
    });

    let response: Response | undefined;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });

        if (!isSafeToRetry(method) || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
          break;
        }

        logger.warn(`${method} ${route} returned temporary HTTP ${response.status}; retrying (${attempt}/3).`);
        await response.body?.cancel();
      } catch (error: unknown) {
        if (!isSafeToRetry(method) || attempt === 3) {
          logger.error(`${method} ${route} network request failed after ${Date.now() - startedAt}ms.`, error);

          throw new DuneConsoleApiError(`Console API network request failed: ${getErrorMessage(error)}`, 0, {
            cause: getErrorCause(error),
          });
        }

        logger.warn(`${method} ${route} network hiccup; retrying (${attempt}/3).`);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 1_000));
    }

    if (!response) {
      throw new DuneConsoleApiError(`Console API request failed without a response: ${method} ${route}`, 0);
    }

    const data = await this.readResponse(response);

    if (!response.ok) {
      const message = getResponseMessage(data) ?? `Request failed with HTTP ${response.status}.`;

      logger.warn(`${method} ${route} failed with HTTP ${response.status} after ${Date.now() - startedAt}ms.`);

      throw new DuneConsoleApiError(message, response.status, data);
    }

    logger.debug(`${method} ${route} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms.`);

    return data;
  }

  async requestMultipart(method: HttpMethod, route: string, form: FormData): Promise<unknown> {
    const url = resolveConsoleUrl(route, this.baseUrl);

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const startedAt = Date.now();

    logger.debug(`${method} ${route}`);

    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error: unknown) {
      logger.error(`${method} ${route} multipart request failed after ${Date.now() - startedAt}ms.`, error);

      throw new DuneConsoleApiError(`Console API upload failed: ${getErrorMessage(error)}`, 0, {
        cause: getErrorCause(error),
      });
    }

    const data = await this.readResponse(response);

    if (!response.ok || isFailedResponse(data)) {
      const message = getResponseMessage(data) ?? `Request failed with HTTP ${response.status}.`;

      logger.warn(`${method} ${route} failed with HTTP ${response.status} after ${Date.now() - startedAt}ms.`);

      throw new DuneConsoleApiError(message, response.status, data);
    }

    logger.debug(`${method} ${route} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms.`);

    return data;
  }

  async readResponse(response: Response): Promise<unknown> {
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
      throw new DuneConsoleApiError(`Console API returned invalid JSON with HTTP ${response.status}.`, response.status);
    }
  }
}

function validateDiscordAttachmentUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Blueprint attachment URL is invalid.");
  }

  const allowedHosts = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Blueprint attachments must be hosted by Discord.");
  }

  return url;
}

function resolveConsoleUrl(route: string, baseUrl: string): URL {
  const url = new URL(route, baseUrl);
  const expectedOrigin = new URL(baseUrl).origin;

  if (url.origin !== expectedOrigin) {
    throw new Error("Dune Console API routes must use the configured Console origin.");
  }

  return url;
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error("Blueprint files must be 32 MB or smaller.");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function isSafeToRetry(method: HttpMethod): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "PUT" || method === "DELETE";
}

class DuneConsoleApiError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "DuneConsoleApiError";
    this.status = status;
    this.details = details;
  }
}

function isRecord(value: unknown): value is ApiResponseObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getResponseMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.error === "string") {
    return value.error;
  }

  if (typeof value.reason === "string") {
    return value.reason;
  }

  return undefined;
}

function isFailedResponse(value: unknown): boolean {
  return isRecord(value) && value.ok === false;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getErrorCause(error: unknown): string {
  if (isRecord(error)) {
    if (typeof error.code === "string") {
      return error.code;
    }

    if (typeof error.name === "string") {
      return error.name;
    }
  }

  return error instanceof Error ? error.name : "UnknownError";
}

export { DuneConsoleClient, DuneConsoleApiError, RequestOptions, HttpMethod };
