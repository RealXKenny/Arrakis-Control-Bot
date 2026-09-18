import { URL } from "node:url";
import { createLogger } from "../../../client/logger";

const logger = createLogger("CONVOY API");

interface ConvoyRequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  binary?: boolean;
}

class ConvoyClient {
  public readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl = "https://vps.advinservers.com", apiKey?: string) {
    if (!apiKey?.trim()) {
      throw new Error("API_KEY is required for the Convoy API.");
    }

    const parsedUrl = new URL(baseUrl);
    if (!["https:", "http:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      throw new Error("Convoy URL must use HTTP(S) without embedded credentials.");
    }
    this.baseUrl = parsedUrl.toString();
    this.apiKey = apiKey.trim();
  }

  /** The v1 server list is an unpaginated array scoped to the API key's team. */
  async listServers(): Promise<Record<string, unknown>[]> {
    const response = await this.request("GET", "/api/v1/client/servers");
    if (!Array.isArray(response) || !response.every(isRecord)) {
      throw new ConvoyApiError("Convoy returned an unexpected server list.", 200, null);
    }
    return response;
  }

  request(method: string, route: string, options: ConvoyRequestOptions = {}): Promise<unknown> {
    const { query, body, binary = false } = options;
    const url = new URL(route, this.baseUrl);
    if (url.origin !== new URL(this.baseUrl).origin || url.username || url.password) {
      throw new Error("Convoy API routes must use the configured origin without credentials.");
    }

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    return this.#request(method, url, body, binary);
  }

  async #request(method: string, url: URL, body: unknown, binary: boolean): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: "error",
        headers: {
          Accept: binary ? "image/png" : "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new ConvoyApiError("Convoy API network request failed.", 0, {
        cause: error instanceof Error ? error.name : "UnknownError",
      });
    }

    if (response.status === 204) return null;
    if (response.status === 429) {
      const seconds = response.headers.get("retry-after");
      const retryAfter = seconds && /^\d+$/.test(seconds) && Number.isSafeInteger(Number(seconds)) ? Number(seconds) : undefined;
      throw new ConvoyApiError("Convoy API rate limit reached. Try again later.", 429, null, retryAfter);
    }

    if (binary) {
      if (!response.ok) {
        throw new ConvoyApiError(`Convoy request failed with HTTP ${response.status}`, response.status, await response.text());
      }

      return Buffer.from(await response.arrayBuffer());
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new ConvoyApiError(`Convoy API returned invalid JSON with HTTP ${response.status}.`, response.status, null);
    }

    if (!response.ok) {
      logger.warn(`${method} ${url.pathname} failed with HTTP ${response.status}.`);

      const responseData = isRecord(data) ? data : {};

      const message =
        response.status === 401
          ? "Advin API authentication failed. Check API_KEY."
          : response.status === 403
            ? "Advin API access denied. Check the endpoint permission (server.read for server lists), the key's team and allowed IP groups."
            : (getErrorMessage(responseData) ?? `Convoy request failed with HTTP ${response.status}`);

      throw new ConvoyApiError(message, response.status, data);
    }

    return data;
  }
}

class ConvoyApiError extends Error {
  public readonly status: number;
  public readonly details: unknown;
  public readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, details: unknown, retryAfterSeconds?: number) {
    super(message);
    this.name = "ConvoyApiError";
    this.status = status;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(data: Record<string, unknown>): string | undefined {
  if (typeof data.message === "string") {
    return data.message;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  return undefined;
}

export { ConvoyClient, ConvoyApiError };
