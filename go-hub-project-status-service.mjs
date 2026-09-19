import { getWorkTarget } from "./go-hub-work-targets.js";
import { createHubProjectStatusProjection } from "./go-hub-project-status.js";

const FACTORY_TASK_ID = /^pureekangraw-ops:[A-Za-z0-9._-]+$/;

function clean(value) {
  return String(value ?? "").trim();
}

async function readJsonResponse(response, code) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(code);
  }
  return payload;
}

function factoryStateStub(binding, taskId) {
  if (!binding) return null;
  if (typeof binding.getByName === "function") return binding.getByName(taskId);
  if (typeof binding.idFromName === "function" && typeof binding.get === "function") {
    return binding.get(binding.idFromName(taskId));
  }
  return null;
}

async function readFactoryState(binding, taskId) {
  const id = clean(taskId);
  if (!FACTORY_TASK_ID.test(id)) throw new Error("PROJECT_STATUS_FACTORY_TASK_ID_INVALID");
  const stub = factoryStateStub(binding, id);
  if (!stub || typeof stub.fetch !== "function") {
    throw new Error("PROJECT_STATUS_FACTORY_STATE_NOT_CONFIGURED");
  }
  const response = await stub.fetch(new Request("https://factory-state.internal/load", { method:"GET" }));
  const state = await readJsonResponse(response, "PROJECT_STATUS_FACTORY_READ_FAILED");
  if (!state.task) throw new Error("PROJECT_STATUS_FACTORY_NOT_FOUND");
  return state;
}

export function createProjectStatusReadService({ lifecycle, factoryBinding = null } = {}) {
  if (!lifecycle || typeof lifecycle.inspect !== "function") {
    throw new Error("PROJECT_STATUS_GITHUB_LIFECYCLE_REQUIRED");
  }

  return Object.freeze({
    async read({ targetId, factoryTaskId = null } = {}) {
      const target = getWorkTarget(targetId);
      if (!target) throw new Error("WORK_TARGET_REQUIRED");

      const githubResponse = await lifecycle.inspect({
        repository:target.repository,
        branch:"main",
      });
      const github = await readJsonResponse(githubResponse, "PROJECT_STATUS_GITHUB_READ_FAILED");
      if (clean(github.repository) !== target.repository) {
        throw new Error("PROJECT_STATUS_GITHUB_TARGET_MISMATCH");
      }

      let factoryTruth = null;
      if (factoryTaskId != null && clean(factoryTaskId)) {
        factoryTruth = await readFactoryState(factoryBinding, factoryTaskId);
        const factoryRepository = clean(factoryTruth?.task?.repository);
        if (factoryRepository && factoryRepository !== target.repository) {
          throw new Error("PROJECT_STATUS_FACTORY_TARGET_MISMATCH");
        }
      }

      return createHubProjectStatusProjection({
        projectId:target.label || target.id.toUpperCase(),
        githubTruth:{
          repository:target.repository,
          branch:clean(github.branch) || "main",
          headSha:clean(github.headSha),
          freshness:"LIVE",
        },
        factoryTruth,
      });
    },
  });
}
