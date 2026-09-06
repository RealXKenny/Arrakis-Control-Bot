import { BLUEPRINT_LIMITS } from "../../infrastructure/config/limits.js";

const MAX_BLUEPRINT_BYTES = BLUEPRINT_LIMITS.maxBytes;
const MAX_TOTAL_RECORDS = BLUEPRINT_LIMITS.maxRecords;
const MAX_NESTING_DEPTH = BLUEPRINT_LIMITS.maxNestingDepth;
const MAX_OBJECT_KEYS = BLUEPRINT_LIMITS.maxObjectKeys;
const MAX_STRING_LENGTH = BLUEPRINT_LIMITS.maxStringLength;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const BLUEPRINT_COLLECTIONS = ["instances", "placeables", "pentashields"] as const;

type BlueprintCollection = (typeof BLUEPRINT_COLLECTIONS)[number];

interface BlueprintRecord {
  building_type?: unknown;
  instance_id?: unknown;
  [key: string]: unknown;
}

interface BlueprintData {
  instances?: unknown[];
  placeables?: unknown[];
  pentashields?: unknown[];
  [key: string]: unknown;
}

interface BlueprintAttachment {
  name?: string | null;
  url?: string | null;
  size?: number | null;
}

interface InspectionState {
  records: number;
}

function validateBlueprintUpload(attachment: BlueprintAttachment | null | undefined, fileBuffer: Buffer): BlueprintData {
  if (!attachment?.name || !attachment.url) {
    throw new Error("A valid blueprint attachment is required.");
  }

  if (!attachment.name.toLowerCase().endsWith(".json")) {
    throw new Error("Blueprint uploads must use a .json filename.");
  }

  if ((attachment.size ?? 0) > MAX_BLUEPRINT_BYTES || fileBuffer.length > MAX_BLUEPRINT_BYTES) {
    throw new Error("Blueprint files must be 32 MB or smaller.");
  }

  if (fileBuffer.length === 0) {
    throw new Error("Blueprint files cannot be empty.");
  }

  if (fileBuffer.includes(0)) {
    throw new Error("Blueprint files must be UTF-8 JSON text, not binary data.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fileBuffer.toString("utf8"));
  } catch {
    throw new Error("The uploaded file is not valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("A blueprint JSON file must contain one top-level object.");
  }

  const blueprint = parsed as BlueprintData;

  if (!BLUEPRINT_COLLECTIONS.some((key) => Array.isArray(blueprint[key]))) {
    throw new Error("The JSON file is not a valid Dune blueprint: no blueprint collections were found.");
  }

  for (const collection of BLUEPRINT_COLLECTIONS) {
    const value = blueprint[collection];

    if (value !== undefined && !Array.isArray(value)) {
      throw new Error(`Blueprint field '${collection}' must be an array.`);
    }
  }

  const state: InspectionState = {
    records: 0,
  };

  inspectValue(blueprint, "$", 0, state);

  validateBlueprintRecords(blueprint);

  return blueprint;
}

function inspectValue(value: unknown, path: string, depth: number, state: InspectionState): void {
  if (depth > MAX_NESTING_DEPTH) {
    throw new Error(`Blueprint JSON is nested too deeply near ${path}.`);
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error(`Blueprint text is too long near ${path}.`);
    }

    if (value.includes("\u0000")) {
      throw new Error(`Blueprint contains an invalid null character near ${path}.`);
    }

    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Blueprint contains an invalid number near ${path}.`);
    }

    return;
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      state.records += 1;

      if (state.records > MAX_TOTAL_RECORDS) {
        throw new Error(`Blueprint has too many records (maximum ${MAX_TOTAL_RECORDS.toLocaleString()}).`);
      }

      inspectValue(value[index], `${path}[${index}]`, depth + 1, state);
    }

    return;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Blueprint contains an unsupported value near ${path}.`);
  }

  const entries = Object.entries(value);

  if (entries.length > MAX_OBJECT_KEYS) {
    throw new Error(`Blueprint object has too many fields near ${path}.`);
  }

  for (const [key, child] of entries) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`Blueprint contains a forbidden field near ${path}.`);
    }

    inspectValue(child, `${path}.${key}`, depth + 1, state);
  }
}

function validateBlueprintRecords(blueprint: BlueprintData): void {
  for (const collection of BLUEPRINT_COLLECTIONS) {
    const records = blueprint[collection];

    if (!records) {
      continue;
    }

    for (const [index, record] of records.entries()) {
      if (!isPlainObject(record)) {
        throw new Error(`Blueprint ${collection}[${index}] must be an object.`);
      }

      const typedRecord = record as BlueprintRecord;

      if ((collection === "instances" || collection === "placeables") && typeof typedRecord.building_type !== "string") {
        throw new Error(`Blueprint ${collection}[${index}] is missing a building_type.`);
      }

      if (collection === "instances" && typedRecord.instance_id !== undefined && !Number.isFinite(Number(typedRecord.instance_id))) {
        throw new Error(`Blueprint instances[${index}] has an invalid instance_id.`);
      }
    }
  }

  const total = (blueprint.instances?.length ?? 0) + (blueprint.placeables?.length ?? 0) + (blueprint.pentashields?.length ?? 0);

  if (total > MAX_TOTAL_RECORDS) {
    throw new Error(`Blueprint has too many records (${total.toLocaleString()}; maximum ${MAX_TOTAL_RECORDS.toLocaleString()}).`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export { MAX_BLUEPRINT_BYTES, validateBlueprintUpload };

export type { BlueprintAttachment, BlueprintData, BlueprintRecord, BlueprintCollection };
