import { URL } from "node:url";
import { createLogger } from "../../core/logger";
import { MAX_BLUEPRINT_BYTES, validateBlueprintUpload } from "../../../modules/validators/blueprintValidator";

const logger = createLogger("DUNE API");
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface RequestOptions {
  authenticate?: boolean;
  includeCsrf?: boolean;

  routeParams?: Record<string, string | number | boolean>;

  query?: Record<string, string | number | boolean | null | undefined>;

  body?: unknown;
  captureSession?: boolean;
  retryAuth?: boolean;
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

  private sessionCookie: string | null;
  private csrfToken: string | null;
  private password: string | null;
  private reauthPromise: Promise<unknown> | null;

  constructor(baseUrl: string) {
    if (!baseUrl) {
      throw new Error("CONSOLE_URL is required to create a Dune console client.");
    }

    this.baseUrl = new URL(baseUrl).toString();
    this.sessionCookie = null;
    this.csrfToken = null;
    this.password = null;
    this.reauthPromise = null;
  }

  async getAuthState(): Promise<unknown> {
    const response = await this.request("GET", "/api/auth/state");

    if (isRecord(response)) {
      const token = getString(response.csrfToken) ?? getString(response.csrf) ?? getString(response.token);

      if (token) {
        this.csrfToken = token;
      }
    }

    return response;
  }

  async login(password: string): Promise<unknown> {
    if (!password) {
      throw new Error("A Dune console password is required to log in.");
    }

    this.password = password;

    const response = await this.request("POST", "/api/auth/login", {
      authenticate: false,
      body: { password },
      includeCsrf: false,
      captureSession: true,
      retryAuth: false,
    });

    if (!this.sessionCookie) {
      throw new Error("Login succeeded without returning an asc_session cookie.");
    }

    await this.getAuthState();

    if (!this.csrfToken) {
      throw new Error("The console did not provide a CSRF token after login.");
    }

    return response;
  }

  async logout(): Promise<unknown> {
    try {
      return await this.request("POST", "/api/auth/logout", {
        body: {},
        retryAuth: false,
      });
    } finally {
      this.sessionCookie = null;
      this.csrfToken = null;
    }
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

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    if (fileBuffer.byteLength > MAX_BLUEPRINT_BYTES) {
      throw new Error("Blueprint files must be 32 MB or smaller.");
    }

    validateBlueprintUpload(attachment, fileBuffer);

    const form = new FormData();

    form.set("player_id", String(playerId));

    form.set(
      "file",
      new Blob([fileBuffer], {
        type: "application/json",
      }),
      attachment.name,
    );

    return this.requestMultipart("POST", "/api/blueprints/import", form);
  }

  async request(method: HttpMethod, route: string, options: RequestOptions = {}): Promise<unknown> {
    const { authenticate = true, includeCsrf = method !== "GET" && method !== "HEAD", query, body, captureSession = false, retryAuth = true } = options;

    const url = new URL(route, this.baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (authenticate && this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    if (includeCsrf && this.csrfToken) {
      headers["x-csrf-token"] = this.csrfToken;
    }

    const startedAt = Date.now();

    logger.debug(`${method} ${route} requested.`, {
      query: query ? Object.keys(query) : [],
      hasBody: body !== undefined,
      authenticated: authenticate,
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
      } catch (error: unknown) {
        if (attempt === 3) {
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

    if (captureSession) {
      this.captureSessionCookie(response);
    }

    const data = await this.readResponse(response);

    if ((response.status === 401 || response.status === 403) && authenticate && retryAuth && this.password) {
      logger.warn(`${method} ${route} lost its Console session; re-authenticating and retrying once.`);

      await this.reauthenticate();

      return this.request(method, route, {
        ...options,
        retryAuth: false,
      });
    }

    if (!response.ok) {
      const message = getResponseMessage(data) ?? `Request failed with HTTP ${response.status}.`;

      logger.warn(`${method} ${route} failed with HTTP ${response.status} after ${Date.now() - startedAt}ms.`);

      throw new DuneConsoleApiError(message, response.status, data);
    }

    logger.debug(`${method} ${route} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms.`);

    return data;
  }

  async reauthenticate(): Promise<unknown> {
    if (!this.password) {
      throw new Error("Cannot re-authenticate without the configured console password.");
    }

    if (!this.reauthPromise) {
      this.reauthPromise = this.login(this.password).finally(() => {
        this.reauthPromise = null;
      });
    }

    return this.reauthPromise;
  }

  async requestMultipart(method: HttpMethod, route: string, form: FormData, retryAuth = true): Promise<unknown> {
    const url = new URL(route, this.baseUrl);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    if (this.csrfToken) {
      headers["x-csrf-token"] = this.csrfToken;
    }

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

    if ((response.status === 401 || response.status === 403) && retryAuth && this.password) {
      logger.warn(`${method} ${route} lost its Console session during multipart upload; re-authenticating and retrying once.`);

      await this.reauthenticate();

      return this.requestMultipart(method, route, form, false);
    }

    if (!response.ok || isFailedResponse(data)) {
      const message = getResponseMessage(data) ?? `Request failed with HTTP ${response.status}.`;

      logger.warn(`${method} ${route} failed with HTTP ${response.status} after ${Date.now() - startedAt}ms.`);

      throw new DuneConsoleApiError(message, response.status, data);
    }

    logger.debug(`${method} ${route} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms.`);

    return data;
  }

  captureSessionCookie(response: Response): void {
    const getSetCookie = (
      response.headers as Headers & {
        getSetCookie?: () => string[];
      }
    ).getSetCookie;

    const cookies = typeof getSetCookie === "function" ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie")].filter((cookie): cookie is string => Boolean(cookie));

    const session = cookies.find((cookie) => cookie.startsWith("asc_session="));

    if (session) {
      this.sessionCookie = session.split(";", 1)[0];
    }
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

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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
