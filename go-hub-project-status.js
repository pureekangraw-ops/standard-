export const PROJECT_STATUS_ENVELOPE_VERSION = 1;
export const PROJECT_STATUS_SOURCES = Object.freeze(["github","board","factory","lighthouse","drive"]);
export const PROJECT_STATUS_COMMON_STATUSES = Object.freeze(["IDLE","ACTIVE","VERIFY","BLOCKED","DONE"]);
export const PROJECT_STATUS_FRESHNESS = Object.freeze(["LIVE","STALE","OFFLINE","UNKNOWN"]);

const SOURCES = new Set(PROJECT_STATUS_SOURCES);
const STATUSES = new Set(PROJECT_STATUS_COMMON_STATUSES);
const FRESHNESS = new Set(PROJECT_STATUS_FRESHNESS);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function required(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) freeze(nested, seen);
  return Object.freeze(value);
}

export function createProjectStatusEnvelope(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("PROJECT_STATUS_ENVELOPE_INVALID");
  const source = required(input.source, "PROJECT_STATUS_SOURCE_REQUIRED").toLowerCase();
  if (!SOURCES.has(source)) throw new Error("PROJECT_STATUS_SOURCE_INVALID");
  const status = required(input.status, "PROJECT_STATUS_STATUS_REQUIRED").toUpperCase();
  if (!STATUSES.has(status)) throw new Error("PROJECT_STATUS_STATUS_INVALID");
  const freshness = String(input.freshness || "UNKNOWN").trim().toUpperCase();
  if (!FRESHNESS.has(freshness)) throw new Error("PROJECT_STATUS_FRESHNESS_INVALID");
  const detail = input.detail == null ? null : clone(input.detail);
  if (detail != null && (!detail || typeof detail !== "object" || Array.isArray(detail))) {
    throw new Error("PROJECT_STATUS_DETAIL_INVALID");
  }
  return freeze({
    envelopeVersion:PROJECT_STATUS_ENVELOPE_VERSION,
    projectId:required(input.projectId, "PROJECT_STATUS_PROJECT_ID_REQUIRED"),
    source,
    status,
    sourceStatus:text(input.sourceStatus),
    title:text(input.title) || source.toUpperCase(),
    summary:text(input.summary),
    sourceRef:text(input.sourceRef),
    updatedAt:text(input.updatedAt),
    freshness,
    detail,
  });
}

function latestAuditAt(snapshot = {}) {
  const audit = Array.isArray(snapshot.audit) ? snapshot.audit : [];
  return audit.map(item => text(item?.at)).filter(Boolean).sort().at(-1) || null;
}

export function freshnessFromTimestamp(value, { now = Date.now(), liveMs = 5 * 60 * 1000, staleMs = 30 * 60 * 1000 } = {}) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "UNKNOWN";
  const age = Math.max(0, Number(now) - parsed);
  if (age <= liveMs) return "LIVE";
  if (age <= staleMs) return "STALE";
  return "UNKNOWN";
}

function overallStatus(snapshot = {}) {
  const state = String(snapshot.state || "").toUpperCase();
  const factoryStage = String(snapshot.factoryStage || "").toUpperCase();
  if (snapshot.blocker || ["BLOCKED","CONFLICT","CI_FAILED","DEPLOY_FAILED","VERIFY_FAILED"].includes(state) || factoryStage === "RECOVERY_REQUIRED") {
    return "BLOCKED";
  }
  if (["VERIFIED","CLOSED","LEARNED"].includes(state) || ["CLOSED","LEARNED"].includes(factoryStage)) return "DONE";
  if (["DEPLOYED","VERIFY"].includes(state) || ["MERGE_GATE","PRODUCT_VERIFIED","PUBLISHED","OBSERVED","VERIFIED_CHAIN"].includes(factoryStage)) return "VERIFY";
  if (state || factoryStage) return "ACTIVE";
  return "IDLE";
}

function githubSource(projectId, snapshot, now) {
  const hasGitHub = Boolean(text(snapshot.repository) || text(snapshot.headSha) || snapshot.pullRequest || snapshot.ci || snapshot.deployment);
  if (!hasGitHub) return null;
  const updatedAt = latestAuditAt(snapshot);
  return createProjectStatusEnvelope({
    projectId,
    source:"github",
    status:overallStatus(snapshot),
    sourceStatus:text(snapshot.ci?.status) || text(snapshot.pullRequest?.state) || text(snapshot.state) || "UNKNOWN",
    title:"GitHub",
    summary:text(snapshot.repository),
    sourceRef:text(snapshot.headSha) || text(snapshot.baseSha),
    updatedAt,
    freshness:freshnessFromTimestamp(updatedAt, { now }),
    detail:{
      repo:text(snapshot.repository),
      branch:text(snapshot.workBranch) || text(snapshot.baseBranch),
      sha:text(snapshot.headSha),
      pr:snapshot.pullRequest?.number ? Number(snapshot.pullRequest.number) : null,
      ci:text(snapshot.ci?.status),
      deploy:text(snapshot.deployment?.status || snapshot.publication?.deployment?.status),
    },
  });
}

function factorySource(projectId, snapshot, now) {
  const hasFactory = Boolean(text(snapshot.factoryStage) || snapshot.assembly || snapshot.assemblyQc || snapshot.piece || snapshot.buildArtifact || snapshot.blocker);
  if (!hasFactory) return null;
  const updatedAt = latestAuditAt(snapshot);
  return createProjectStatusEnvelope({
    projectId,
    source:"factory",
    status:overallStatus(snapshot),
    sourceStatus:text(snapshot.factoryStage) || text(snapshot.state) || "UNKNOWN",
    title:"Factory",
    summary:text(snapshot.currentPiece?.title) || text(snapshot.workPackage?.title) || text(snapshot.intent),
    sourceRef:text(snapshot.assembly?.id) || text(snapshot.piece?.id) || text(snapshot.id),
    updatedAt,
    freshness:freshnessFromTimestamp(updatedAt, { now }),
    detail:{
      stage:text(snapshot.factoryStage),
      piece:text(snapshot.piece?.id),
      assembly:text(snapshot.assembly?.id),
      qc:text(snapshot.assemblyQc?.status || snapshot.pieceQc?.status),
      blocker:text(snapshot.blocker),
      nextAction:text(snapshot.nextAction),
    },
  });
}

export function createGoHubProjectStatus({
  projectId,
  taskSnapshot = {},
  now = Date.now(),
} = {}) {
  const id = required(projectId, "PROJECT_STATUS_PROJECT_ID_REQUIRED");
  const snapshot = taskSnapshot && typeof taskSnapshot === "object" && !Array.isArray(taskSnapshot) ? taskSnapshot : {};
  const sources = [githubSource(id, snapshot, now), factorySource(id, snapshot, now)].filter(Boolean);
  return freeze({
    projectId:id,
    status:overallStatus(snapshot),
    updatedAt:latestAuditAt(snapshot),
    sources,
  });
}
