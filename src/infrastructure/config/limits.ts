const BLUEPRINT_LIMITS = Object.freeze({
  maxBytes: 32 << 20,
  maxRecords: 50_000,
  maxNestingDepth: 32,
  maxObjectKeys: 2_000,
  maxStringLength: 8_192,
  minimumOfflineMs: 60_000,
} as const);

export { BLUEPRINT_LIMITS };

export type BlueprintLimits = typeof BLUEPRINT_LIMITS;
