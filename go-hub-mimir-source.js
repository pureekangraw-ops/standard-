export const MIMIR_SOURCE_TYPES = Object.freeze([
  "INTERNAL_REALITY",
  "CURATED",
  "PRIMARY",
  "EXTERNAL",
  "DOCUMENT",
  "MEMORY",
  "EXPERIENCE",
]);

const SOURCE_TYPE_SET = new Set(MIMIR_SOURCE_TYPES);
const PERMISSIONS = new Set(["ALLOWED", "RESTRICTED", "DENIED", "REQUIRES_APPROVAL"]);
const AVAILABILITY = new Set(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]);
const DIRECTNESS = new Set(["DIRECT", "INDIRECT"]);

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalized(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function iso(value, label, { optional = false } = {}) {
  const text = String(value || "").trim();
  if (!text && optional) return null;
  if (!text || Number.isNaN(new Date(text).getTime())) throw new Error(`${label} must be an ISO date`);
  return text;
}

export function createMimirSourceRecord(input = {}) {
  const type = normalized(input.type);
  if (!SOURCE_TYPE_SET.has(type)) throw new Error(`unsupported MIMIR source type: ${type || "UNKNOWN"}`);

  const permission = normalized(input.permission);
  if (!PERMISSIONS.has(permission)) throw new Error(`unsupported source permission: ${permission || "UNKNOWN"}`);

  const availability = normalized(input.availability);
  if (!AVAILABILITY.has(availability)) throw new Error(`unsupported source availability: ${availability || "UNKNOWN"}`);

  const directness = normalized(input.directness);
  if (!DIRECTNESS.has(directness)) throw new Error(`unsupported source directness: ${directness || "UNKNOWN"}`);

  return Object.freeze({
    id: required(input.id, "source id"),
    type,
    provider: required(input.provider, "source provider"),
    location: required(input.location, "source location"),
    provenance: Object.freeze({
      sourceId: required(input.sourceId, "provenance source id"),
      sourceUrl: required(input.sourceUrl, "provenance source url"),
      directness,
    }),
    permission,
    availability,
    freshness: Object.freeze({
      retrievedAt: iso(input.retrievedAt, "retrievedAt"),
      freshUntil: iso(input.freshUntil, "freshUntil", { optional: true }),
    }),
    conflictWith: Object.freeze((Array.isArray(input.conflictWith) ? input.conflictWith : [])
      .map(value => String(value || "").trim())
      .filter(Boolean)),
  });
}
