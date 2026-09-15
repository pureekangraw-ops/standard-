const SECRET_KEY = /(authorization|token|secret|passcode|master.?key)/i;
const STATUSES = new Set(["success", "failure", "blocked"]);
const SOURCES = new Set(["github", "go-hub-gateway"]);

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function rejectSecrets(value, path = "root") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`SECRET_FIELD_REJECTED:${path}.${key}`);
    rejectSecrets(nested, `${path}.${key}`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function createRealityReceipt(input = {}) {
  rejectSecrets(input);
  const status = required(input.status, "status");
  const source = required(input.source, "source");
  if (!STATUSES.has(status)) throw new Error(`unsupported receipt status: ${status}`);
  if (!SOURCES.has(source)) throw new Error(`unsupported receipt source: ${source}`);
  const receipt = {
    id: required(input.id, "receipt id"),
    action: required(input.action, "action"),
    status,
    repository: required(input.repository, "repository"),
    observedAt: required(input.observedAt, "observedAt"),
    source,
    identity: structuredClone(input.identity || {}),
    result: structuredClone(input.result ?? null),
    evidence: structuredClone(input.evidence ?? null),
  };
  return deepFreeze(receipt);
}

export function fingerprintCompare(input = {}) {
  const files = [...(Array.isArray(input.files) ? input.files : [])]
    .map(file => ({
      path: String(file?.path || ""),
      status: String(file?.status || ""),
      additions: Number(file?.additions || 0),
      deletions: Number(file?.deletions || 0),
      patch: file?.patch == null ? null : String(file.patch),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return JSON.stringify({
    base: String(input.base || ""),
    head: String(input.head || ""),
    status: input.status == null ? null : String(input.status),
    aheadBy: Number(input.aheadBy || 0),
    behindBy: Number(input.behindBy || 0),
    files,
  });
}
