import { DuneConsoleClient, type HttpMethod, type RequestOptions } from "./core/DuneConsoleClient";
import { loadEndpointCatalog, resolveRoute, type EndpointDefinition } from "./reference/endpointCatalog";

interface BlueprintImportResult {
  message?: string;
  blueprintName?: string | null;
  blueprintId?: string | null;
  pieces?: number | null;
  placeables?: number | null;
  pentashields?: number | null;
}

class DuneApi extends DuneConsoleClient {
  public readonly endpoints: EndpointDefinition[];

  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey);

    this.endpoints = loadEndpointCatalog();
  }

  findEndpoints(search = ""): EndpointDefinition[] {
    const term = search.toLowerCase();

    return this.endpoints.filter(({ method, route, description }) => `${method} ${route} ${description}`.toLowerCase().includes(term));
  }

  async call(method: HttpMethod, route: string, options: RequestOptions = {}): Promise<unknown> {
    const { routeParams, ...requestOptions } = options;

    const resolvedRoute = resolveRoute(route, routeParams);

    return this.request(method, resolvedRoute, requestOptions);
  }

  async importBlueprint(playerId: string | number, attachment: Parameters<DuneConsoleClient["uploadBlueprint"]>[1]): Promise<BlueprintImportResult> {
    const response = await this.uploadBlueprint(playerId, attachment);

    if (!isRecord(response)) {
      return {};
    }

    return {
      message: typeof response.message === "string" ? response.message : undefined,
      blueprintName: typeof response.blueprintName === "string" ? response.blueprintName : null,
      blueprintId: typeof response.blueprintId === "string" ? response.blueprintId : null,
      pieces: typeof response.pieces === "number" ? response.pieces : null,
      placeables: typeof response.placeables === "number" ? response.placeables : null,
      pentashields: typeof response.pentashields === "number" ? response.pentashields : null,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export { DuneApi };
