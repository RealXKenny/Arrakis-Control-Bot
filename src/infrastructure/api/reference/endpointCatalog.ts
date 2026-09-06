import fs from "node:fs";
import path from "node:path";

interface EndpointDefinition {
  method: HttpMethod;
  route: string;
  description: string;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RouteParameters = Record<string, string | number | boolean>;

const referencePath = path.resolve(process.cwd(), "docs", "dune-awakening-console-api-reference.md");

const endpointPattern = /^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)/;

function loadEndpointCatalog(): EndpointDefinition[] {
  return fs
    .readFileSync(referencePath, "utf8")
    .split(/\r?\n/)
    .flatMap((line): EndpointDefinition[] => {
      const match = line.match(endpointPattern);

      if (!match) {
        return [];
      }

      return [
        {
          method: match[1] as HttpMethod,
          route: match[2],
          description: match[3].trim(),
        },
      ];
    });
}

function resolveRoute(route: string, parameters: RouteParameters = {}): string {
  return route.replace(/\{([^}]+)\}/g, (_, parameterName: string): string => {
    const value = parameters[parameterName];

    if (value === undefined || value === null) {
      throw new Error(`Missing route parameter: ${parameterName}`);
    }

    return encodeURIComponent(String(value));
  });
}

export { loadEndpointCatalog, resolveRoute };

export type { EndpointDefinition, HttpMethod, RouteParameters };
