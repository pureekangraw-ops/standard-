const RELATIONS = new Set(["SUPPORTS", "CONTRADICTS"]);

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function sourceId(source = {}) {
  return String(source?.provenance?.sourceId || source?.id || "").trim();
}

function isCurrent(source = {}, now = new Date()) {
  const freshUntil = String(source?.freshness?.freshUntil || "").trim();
  if (!freshUntil) return null;
  const deadline = new Date(freshUntil);
  if (Number.isNaN(deadline.getTime())) return null;
  return deadline.getTime() >= now.getTime();
}

function usable(source = {}, now = new Date()) {
  if (upper(source.permission) !== "ALLOWED") return false;
  if (upper(source.availability) !== "AVAILABLE") return false;
  return isCurrent(source, now) !== false;
}

function hasSourceConflict(entries = []) {
  const ids = new Set(entries.map(entry => sourceId(entry.source)).filter(Boolean));
  return entries.some(entry => (Array.isArray(entry.source?.conflictWith) ? entry.source.conflictWith : [])
    .some(value => ids.has(String(value || "").trim())));
}

function freezeEvidence(entries) {
  return Object.freeze(entries.map(entry => Object.freeze({
    relation: entry.relation,
    sourceId: sourceId(entry.source) || null,
    sourceType: upper(entry.source?.type) || "UNKNOWN",
    directness: upper(entry.source?.provenance?.directness) || "UNKNOWN",
  })));
}

function result(status, reason, entries = []) {
  return Object.freeze({
    status,
    reason,
    evidence: freezeEvidence(entries),
  });
}

export function createMimirVerificationDesk({ now = () => new Date() } = {}) {
  if (typeof now !== "function") throw new TypeError("MIMIR verification now must be a function");

  return function verify({ claim = "", evidence = [] } = {}) {
    if (!String(claim || "").trim()) return result("UNKNOWN", "CLAIM_REQUIRED");
    if (!Array.isArray(evidence) || evidence.length === 0) return result("UNKNOWN", "NO_EVIDENCE");

    const currentTime = now();
    const usableEvidence = evidence
      .map(item => ({ relation: upper(item?.relation), source: item?.source || null }))
      .filter(item => RELATIONS.has(item.relation) && item.source && usable(item.source, currentTime));

    if (!usableEvidence.length) return result("UNKNOWN", "NO_USABLE_EVIDENCE");
    if (hasSourceConflict(usableEvidence)) return result("UNKNOWN", "CONFLICTING_EVIDENCE", usableEvidence);

    const supports = usableEvidence.filter(item => item.relation === "SUPPORTS");
    const contradicts = usableEvidence.filter(item => item.relation === "CONTRADICTS");
    if (supports.length && contradicts.length) {
      return result("UNKNOWN", "CONFLICTING_EVIDENCE", usableEvidence);
    }

    const directSupports = supports.filter(item => upper(item.source?.provenance?.directness) === "DIRECT");
    const directContradicts = contradicts.filter(item => upper(item.source?.provenance?.directness) === "DIRECT");
    if (directSupports.length) return result("PASS", "DIRECT_EVIDENCE_SUPPORTS", directSupports);
    if (directContradicts.length) return result("FAIL", "DIRECT_EVIDENCE_CONTRADICTS", directContradicts);

    const distinctSupports = new Set(supports.map(item => sourceId(item.source)).filter(Boolean));
    const distinctContradicts = new Set(contradicts.map(item => sourceId(item.source)).filter(Boolean));
    if (distinctSupports.size >= 2) return result("PASS", "CORROBORATED_EVIDENCE_SUPPORTS", supports);
    if (distinctContradicts.size >= 2) return result("FAIL", "CORROBORATED_EVIDENCE_CONTRADICTS", contradicts);

    return result("UNKNOWN", "INSUFFICIENT_CORROBORATION", usableEvidence);
  };
}

function uniform(values, fallback = "UNKNOWN") {
  const normalized = [...new Set(values.filter(Boolean))];
  if (!normalized.length) return fallback;
  return normalized.length === 1 ? normalized[0] : "MIXED";
}

export function evaluateMimirTrust({ sources = [], now = new Date() } = {}) {
  if (!Array.isArray(sources)) throw new TypeError("MIMIR trust sources must be an array");
  const currentTime = now instanceof Date ? now : new Date(now);
  const sourceIds = new Set(sources.map(sourceId).filter(Boolean));
  const freshnessStates = sources.map(source => {
    const state = isCurrent(source, currentTime);
    return state === true ? "CURRENT" : state === false ? "STALE" : "UNKNOWN";
  });

  return Object.freeze({
    authority: uniform(sources.map(source => upper(source?.type))),
    directness: uniform(sources.map(source => upper(source?.provenance?.directness))),
    freshness: uniform(freshnessStates),
    corroboration: sourceIds.size > 1 ? "MULTI_SOURCE" : sourceIds.size === 1 ? "SINGLE_SOURCE" : "NONE",
    provenance: sources.length > 0 && sources.every(source =>
      Boolean(String(source?.provenance?.sourceId || "").trim()) &&
      Boolean(String(source?.provenance?.sourceUrl || "").trim())
    ) ? "COMPLETE" : "INCOMPLETE",
  });
}
