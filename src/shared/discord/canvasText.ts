function canvasDisplayName(value: string | null | undefined, fallback: string | null | undefined, maximumLength = 80): string {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeFallback = (fallback ?? "").normalize("NFKC").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(normalized || safeFallback || "Traveler").slice(0, maximumLength).join("");
}

export { canvasDisplayName };
