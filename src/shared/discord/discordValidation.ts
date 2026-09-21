function discordValidationIssues(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  const apiError = error as { code?: unknown; rawError?: { errors?: unknown } };
  if (apiError.code !== 50035) return [];

  const issues: string[] = [];
  const visit = (value: unknown, path: string[], depth: number): void => {
    if (!value || typeof value !== "object" || depth > 12 || issues.length >= 4) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "_errors" && Array.isArray(child)) {
        for (const item of child) {
          const code = item && typeof item === "object" ? (item as { code?: unknown }).code : undefined;
          if (typeof code === "string" && /^[A-Z0-9_]{1,60}$/.test(code)) {
            issues.push(`${path.join(".") || "body"}: ${code}`);
          }
          if (issues.length >= 4) break;
        }
      } else if (/^[a-zA-Z_][a-zA-Z_0-9]{0,39}$|^\d{1,3}$/.test(key)) {
        visit(child, [...path, key], depth + 1);
      }
      if (issues.length >= 4) break;
    }
  };

  visit(apiError.rawError?.errors, [], 0);
  return issues;
}

export { discordValidationIssues };
