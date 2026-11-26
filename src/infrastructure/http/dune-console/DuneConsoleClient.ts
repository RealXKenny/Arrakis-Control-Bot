import { URL } from "node:url";
import { readBoundedBody } from "../readBoundedBody";
import { CircuitBreaker, CircuitOpenError, ConcurrencyLimiter, ConcurrencyLimitError, TtlCache, upstreamArea } from "../resilience";
import { ConsoleOutageLog, retryAfterMs, retryDelayMs, routeLabel } from "./consoleOutageLog";

// Generous for player directories, but bounded so one bad response cannot exhaust memory.
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
import { createLogger } from "../../../client/logger";
import { MAX_BLUEPRINT_BYTES, validateBlueprintUpload } from "../../../modules/players/blueprints/blueprintValidator";

const logger = createLogger("DUNE API");
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;

interface DuneConsoleClientOptions {
  /** Per-attempt timeout for JSON requests (CONSOLE_TIMEOUT_MS). Uploads keep their own longer limit. */
  timeoutMs?: number;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface RequestOptions {
  routeParams?: Record<string, string | number | boolean>;

  query?: Record<string, string | number | boolean | null | undefined>;

  body?: unknown;

  /**
   * GET only: keep the response for this long. Identical GETs already in flight are always
   * shared, so a burst of the same lookup makes one upstream call.
   */
  cacheTtlMs?: number;
}

interface ApiResponseObject {
  [key: string]: unknown;
}

interface BlueprintAttachment {
  url: string;
  name: string;
  size?: number;
}

interface BinaryResponse {
  data: Buffer;
  contentType: string | null;
  filename: string | null;
}

class DuneConsoleClient {
  public readonly baseUrl: string;

  private readonly apiKey: string;

  // Dev note: The breaker is a stillsuit for the event loop; it stops us leaking requests into a dead desert.
  private readonly breaker = new CircuitBreaker({ failureThreshold: 5, openMs: 30_000 });
  private readonly limiter = new ConcurrencyLimiter(8, 100);
  private readonly cache = new TtlCache(500);
  private readonly outage = new ConsoleOutageLog(logger);
  private readonly timeoutMs: number;

  constructor(baseUrl: string, apiKey: string, options: DuneConsoleClientOptions = {}) {
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
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });

    if (!fileResponse.ok) {
      throw new Error(`Unable to download the uploaded blueprint (HTTP ${fileResponse.status}).`);
    }

    const contentLength = Number(fileResponse.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_BLUEPRINT_BYTES) {
      await fileResponse.body?.cancel();
      throw new Error("Blueprint files must be 32 MB or smaller.");
    }

    const fileBuffer = await readBoundedBody(fileResponse, MAX_BLUEPRINT_BYTES, "Blueprint files must be 32 MB or smaller.");

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
    if (method !== "GET") return this.guard(route, () => this.send(method, route, options));
    const key = `${route}?${JSON.stringify(Object.entries(options.query ?? {}).filter(([, value]) => value !== undefined && value !== null).sort(([a], [b]) => a.localeCompare(b)))}`;
    return this.cache.getOrLoad(key, options.cacheTtlMs ?? 0, () => this.guard(route, () => this.send(method, route, options)));
  }

  /** Upstream areas whose circuit is currently open, for runtime health reporting. */
  get openCircuits(): string[] {
    return this.breaker.openKeys();
  }

  /** Requests waiting for a free upstream slot. */
  get queuedRequests(): number {
    return this.limiter.queuedCount;
  }

  /** Fail fast while an area is down, and cap how many Console calls run at once. */
  private async guard<T>(route: string, work: () => Promise<T>): Promise<T> {
    try {
      return await this.breaker.run(upstreamArea(route), () => this.limiter.run(work), isUpstreamFailure);
    } catch (error) {
      if (error instanceof CircuitOpenError) throw new DuneConsoleApiError("The Dune Console is temporarily unavailable. Try again in a moment.", 503, { circuit: error.key });
      if (error instanceof ConcurrencyLimitError) throw new DuneConsoleApiError("The Dune Console is busy. Try again in a moment.", 429, null);
      throw error;
    }
  }

  private async send(method: HttpMethod, route: string, options: RequestOptions): Promise<unknown> {
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
    const read = isSafeToRetry(method);
    const label = routeLabel(route);

    // Dev note: Safe requests get three thumpers; mutations get no accidental encore.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attemptStartedAt = Date.now();
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          // Never follow a redirect with the Console API key attached.
          redirect: "error",
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!read || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
          break;
        }

        const waitMs = retryAfterMs(response.headers.get("retry-after")) ?? retryDelayMs(attempt);
        logger.debug(`${method} ${label} returned temporary HTTP ${response.status}; retrying in ${waitMs}ms (${attempt}/3).`);
        await response.body?.cancel();
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      } catch (error: unknown) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (!read || attempt === 3) {
          this.outage.recordFailure(
            { method, route, kind: timedOut ? "timeout" : "network", durationMs: Date.now() - startedAt },
            read,
          );

          throw new DuneConsoleApiError(`Console API network request failed: ${getErrorMessage(error)}`, 0, {
            cause: getErrorCause(error),
          });
        }

        logger.debug(`${method} ${label} ${timedOut ? "timed out" : "network hiccup"} after ${Date.now() - attemptStartedAt}ms; retrying (${attempt}/3).`);
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
      }
    }

    if (!response) {
      throw new DuneConsoleApiError(`Console API request failed without a response: ${method} ${route}`, 0);
    }

    const data = await this.readResponse(response);

    if (!response.ok || isFailedResponse(data)) {
      const message = getResponseMessage(data) ?? `Request failed with HTTP ${response.status}.`;

      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        // An unavailable Console: aggregated for reads, always reported for writes.
        this.outage.recordFailure({ method, route, kind: "status", status: response.status, durationMs: Date.now() - startedAt }, read);
      } else {
        // A 4xx means the Console is up and refused this request; that is worth a line of its own.
        this.outage.recordSuccess();
        logger.warn(`${method} ${label} failed with HTTP ${response.status} after ${Date.now() - startedAt}ms.`);
      }

      throw new DuneConsoleApiError(message, response.status, data);
    }

    this.outage.recordSuccess();
    logger.debug(`${method} ${route} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms.`);

    return data;
  }

  async requestMultipart(method: HttpMethod, route: string, form: FormData): Promise<unknown> {
    return this.guard(route, () => this.sendMultipart(method, route, form));
  }

  private async sendMultipart(method: HttpMethod, route: string, form: FormData): Promise<unknown> {
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
        redirect: "error",
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

  async requestBinary(method: "GET", route: string, maximumBytes: number): Promise<BinaryResponse> {
    return this.guard(route, () => this.sendBinary(method, route, maximumBytes));
  }

  private async sendBinary(method: "GET", route: string, maximumBytes: number): Promise<BinaryResponse> {
    const url = resolveConsoleUrl(route, this.baseUrl);
    const response = await fetch(url, {
      method,
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${this.apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const data = await this.readResponse(response);
      throw new DuneConsoleApiError(getResponseMessage(data) ?? `Request failed with HTTP ${response.status}.`, response.status, data);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      await response.body?.cancel();
      throw new Error(`The requested archive exceeds the ${Math.floor(maximumBytes / 1024 / 1024)} MB Discord download limit.`);
    }

    return {
      data: await readBoundedBody(response, maximumBytes, `The requested archive exceeds the ${Math.floor(maximumBytes / 1024 / 1024)} MB Discord download limit.`),
      contentType: response.headers.get("content-type"),
      filename: parseContentDispositionFilename(response.headers.get("content-disposition")),
    };
  }

  async readResponse(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = (await readBoundedBody(response, MAX_RESPONSE_BYTES, "Console API response is too large.")).toString("utf8");

    if (!contentType.includes("application/json")) {
      return text;
    }

    try {
      return JSON.parse(text) as unknown;
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

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) return null;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1]?.trim() ?? null;
}

function isSafeToRetry(method: HttpMethod): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "PUT" || method === "DELETE";
}

/** Network errors, timeouts, throttling and server errors mean the upstream is unhealthy; 4xx answers do not. */
function isUpstreamFailure(error: unknown): boolean {
  if (!(error instanceof DuneConsoleApiError)) return false;
  return error.status === 0 || error.status === 429 || error.status >= 500;
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
export type { BinaryResponse, BlueprintAttachment, DuneConsoleClientOptions };
