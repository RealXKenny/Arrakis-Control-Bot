function containsText(components: readonly unknown[], marker: string): boolean {
  return components.some((component) => {
    if (!component || typeof component !== "object") {
      return false;
    }

    const item = component as {
      content?: unknown;
      data?: {
        content?: unknown;
      };
      components?: readonly unknown[];
    };

    const content = typeof item.content === "string" ? item.content : typeof item.data?.content === "string" ? item.data.content : undefined;

    if (content?.includes(marker)) {
      return true;
    }

    // Dev note: Components nest like sietch tunnels; keep searching until the marker surfaces.
    return Array.isArray(item.components) && containsText(item.components, marker);
  });
}

export { containsText };
