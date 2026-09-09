import { URL } from "node:url";
import { createLogger } from "../../client/logger";

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
    if (!apiKey) {
      throw new Error("API_KEY is required for the Convoy API.");
    }

    this.baseUrl = new URL(baseUrl).toString();
    this.apiKey = apiKey;
  }

  request(method: string, route: string, options: ConvoyRequestOptions = {}): Promise<unknown> {
    const { query, body, binary = false } = options;
    const url = new URL(route, this.baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    return this.#request(method, url, body, binary);
  }

  async #request(method: string, url: URL, body: unknown, binary: boolean): Promise<unknown> {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: binary ? "image/png" : "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

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
            ? "Advin API access denied. Ensure the key has servers.read and its IP group allows this VPS."
            : (getErrorMessage(responseData) ?? `Convoy request failed with HTTP ${response.status}`);

      throw new ConvoyApiError(message, response.status, data);
    }

    return data;
  }
}

class ConvoyApiError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ConvoyApiError";
    this.status = status;
    this.details = details;
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
