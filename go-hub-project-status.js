export const PROJECT_STATUS_ENVELOPE_VERSION = 1;
export const PROJECT_STATUS_COMMON_STATUSES = Object.freeze(["IDLE", "ACTIVE", "VERIFY", "BLOCKED", "DONE"]);
export const PROJECT_STATUS_FRESHNESS = Object.freeze(["LIVE", "STALE", "OFFLINE", "UNKNOWN"]);

const STATUS_SET = new Set(PROJECT_STATUS_COMMON_STATUSES);
const FRESHNESS_SET = new Set(PROJECT_STATUS_FRESHNESS);
const BLOCKED_FACTORY_STATES = new Set(["BLOCKED", "CONFLICT", "CI_FAILED", "DEPLOY_FAILED", "VERIFY_FAILED"]);
const DONE_FACTORY_STATES = new Set(["VERIFIED", "CLOSED", "LEARNED"]);
const VERIFY_FACTORY_STATES = new Set(["DEPLOYED"]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function requiredText(value, code) {
  const output = String(value ?? "").trim();
  if (!output) throw new Error(code);
  return output;
}

function optionalText(value) {
  const output = String(value ?? "").trim();
  return output || null;
}

function normalizedFreshness(value) {
  const freshness = String(value ?? "UNKNOWN").trim().toUpperCase();
  if (!FRESHNESS_SET.has(freshness)) throw new Error("PROJECT_STATUS_FRESHNESS_INVALID");
  return freshness;
}

function normalizedStatus(value) {
  const status = String(value ?? "").trim().toUpperCase();
  if (!STATUS_SET.has(status)) throw new Error("PROJECT_STATUS_STATUS_INVALID");
  return status;
}

function lastFactoryUpdate(factoryTruth) {
  const task = factoryTruth?.task;
  const audit = Array.isArray(task?.audit) ? task.audit : [];
  for (let index = audit.length - 1; index >= 0; index -= 1) {
    const at = optionalText(audit[index]?.at);
    if (at) return at;
  }
  return null;
}

export function factoryCommonStatus(factoryTruth = null) {
  const task = factoryTruth?.task;
  if (!task || typeof task !== "object" || Array.isArray(task)) return "IDLE";
  const state = String(task.state ?? "").trim().toUpperCase();
  if (optionalText(task.blocker) || BLOCKED_FACTORY_STATES.has(state)) return "BLOCKED";
  if (DONE_FACTORY_STATES.has(state)) return "DONE";
  if (VERIFY_FACTORY_STATES.has(state)) return "VERIFY";
  return "ACTIVE";
}

export function createProjectStatusEnvelope(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("PROJECT_STATUS_ENVELOPE_INVALID");
  }
  const source = requiredText(input.source, "PROJECT_STATUS_SOURCE_REQUIRED").toLowerCase();
  if (!["github", "factory"].includes(source)) throw new Error("PROJECT_STATUS_SOURCE_INVALID");
  const detail = input.detail == null ? null : clone(input.detail);
  if (detail != null && (!detail || typeof detail !== "object" || Array.isArray(detail))) {
    throw new Error("PROJECT_STATUS_DETAIL_INVALID");
  }
  return deepFreeze({
    envelopeVersion:PROJECT_STATUS_ENVELOPE_VERSION,
    projectId:requiredText(input.projectId, "PROJECT_STATUS_PROJECT_ID_REQUIRED"),
    source,
    status:normalizedStatus(input.status),
    sourceStatus:optionalText(input.sourceStatus),
    title:optionalText(input.title) || source.toUpperCase(),
    summary:optionalText(input.summary),
    sourceRef:optionalText(input.sourceRef),
    updatedAt:optionalText(input.updatedAt),
    freshness:normalizedFreshness(input.freshness),
    detail,
  });
}

export function createHubProjectStatusProjection({
  projectId,
  githubTruth = null,
  factoryTruth = null,
} = {}) {
  const id = requiredText(projectId, "PROJECT_STATUS_PROJECT_ID_REQUIRED");
  const status = factoryCommonStatus(factoryTruth);
  const sources = [];

  if (githubTruth) {
    const repository = requiredText(githubTruth.repository, "PROJECT_STATUS_GITHUB_REPOSITORY_REQUIRED");
    const branch = optionalText(githubTruth.branch);
    const headSha = requiredText(githubTruth.headSha, "PROJECT_STATUS_GITHUB_SHA_REQUIRED");
    sources.push(createProjectStatusEnvelope({
      projectId:id,
      source:"github",
      status,
      sourceStatus:"SOURCE_COMMIT",
      title:"GitHub",
      summary:branch,
      sourceRef:headSha,
      updatedAt:optionalText(githubTruth.updatedAt),
      freshness:githubTruth.freshness ?? "LIVE",
      detail:{
        repo:repository,
        branch,
        sha:headSha,
      },
    }));
  }

  const task = factoryTruth?.task;
  if (task && typeof task === "object" && !Array.isArray(task)) {
    const taskId = requiredText(task.id, "PROJECT_STATUS_FACTORY_TASK_ID_REQUIRED");
    const updatedAt = lastFactoryUpdate(factoryTruth);
    sources.push(createProjectStatusEnvelope({
      projectId:id,
      source:"factory",
      status,
      sourceStatus:optionalText(task.state),
      title:"Factory",
      summary:optionalText(task.intent),
      sourceRef:taskId,
      updatedAt,
      freshness:factoryTruth.freshness ?? "LIVE",
      detail:{
        taskId,
        revision:Number.isSafeInteger(Number(factoryTruth.revision)) ? Number(factoryTruth.revision) : null,
        state:optionalText(task.state),
        nextAction:optionalText(task.nextAction),
        blocker:optionalText(task.blocker),
        repo:optionalText(task.repository),
        baseBranch:optionalText(task.baseBranch),
        baseSha:optionalText(task.baseSha),
        workBranch:optionalText(task.workBranch),
        headSha:optionalText(task.headSha),
        pullRequest:task.pullRequest == null ? null : clone(task.pullRequest),
        ci:task.ci == null ? null : clone(task.ci),
      },
    }));
  }

  return deepFreeze({
    projectId:id,
    status,
    updatedAt:lastFactoryUpdate(factoryTruth) || optionalText(githubTruth?.updatedAt),
    sources,
  });
}
