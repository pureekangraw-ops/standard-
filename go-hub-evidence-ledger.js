const SCOPES = new Set(["piece", "assembly", "artifact"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function createEvidenceEntry(input = {}) {
  const scope = required(input.scope, "scope");
  if (!SCOPES.has(scope)) throw new Error(`unsupported scope: ${scope}`);
  const entry = {
    id: required(input.id, "id"),
    scope,
    claim: required(input.claim, "claim"),
    kind: required(input.kind, "kind"),
    value: clone(input.value),
    repository: input.repository == null ? null : String(input.repository),
    headSha: input.headSha == null ? null : String(input.headSha).trim(),
    recordedAt: input.recordedAt == null ? new Date().toISOString() : String(input.recordedAt),
  };
  if (scope === "piece" && !entry.headSha) throw new Error("headSha is required for piece evidence");
  return Object.freeze(entry);
}

export function appendEvidence(ledger = [], input = {}) {
  const current = Array.isArray(ledger) ? ledger : [];
  const entry = createEvidenceEntry(input);
  if (current.some((item) => item?.id === entry.id)) throw new Error(`duplicate evidence id: ${entry.id}`);
  return [...clone(current), entry];
}
