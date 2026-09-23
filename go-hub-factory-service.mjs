import { createFactoryController } from "./go-hub-factory-task-controller.mjs";
import { createFactoryAutoRunner } from "./go-hub-factory-auto-runner.mjs";

const OWNER = "pureekangraw-ops";
const TASK_ID = /^pureekangraw-ops:[A-Za-z0-9._-]+$/;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function assertTaskId(value) {
  const taskId = String(value || "").trim();
  if (!TASK_ID.test(taskId) || !taskId.startsWith(`${OWNER}:`)) {
    throw Object.assign(new Error("invalid Factory task ID"), { status: 400 });
  }
  return taskId;
}

function stateStub(binding, taskId) {
  if (!binding) return null;
  if (typeof binding.getByName === "function") return binding.getByName(taskId);
  if (typeof binding.idFromName === "function" && typeof binding.get === "function") {
    return binding.get(binding.idFromName(taskId));
  }
  return null;
}

async function readStateResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload?.code || "FACTORY_STATE_ERROR"), { status: response.status });
  }
  return payload;
}

function createStatePort(binding, taskId) {
  const stub = stateStub(binding, taskId);
  if (!stub) return null;

  if (typeof stub.fetch === "function") {
    return Object.freeze({
      async load() {
        return readStateResponse(await stub.fetch(new Request("https://factory-state.internal/load", {
          method: "GET",
        })));
      },
      async save(value) {
        return readStateResponse(await stub.fetch(new Request("https://factory-state.internal/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        })));
      },
    });
  }

  if (typeof stub.load === "function" && typeof stub.save === "function") {
    return Object.freeze({
      load: () => stub.load(),
      save: value => stub.save(value),
    });
  }

  return null;
}

export function createFactoryActionService({ lifecycle, binding, now, createId } = {}) {
  if (!lifecycle) throw new Error("Factory lifecycle is required");
  if (!binding || (typeof binding.getByName !== "function" &&
      !(typeof binding.idFromName === "function" && typeof binding.get === "function"))) {
    throw Object.assign(new Error("FACTORY_STATE_NOT_CONFIGURED"), { status: 503 });
  }

  return async function factoryAction(input = {}) {
    const taskId = assertTaskId(input.taskId);
    const state = createStatePort(binding, taskId);
    if (!state) {
      throw Object.assign(new Error("FACTORY_STATE_NOT_CONFIGURED"), { status: 503 });
    }
    const controller = createFactoryController({ lifecycle, state, ...(now ? { now } : {}), ...(createId ? { createId } : {}) });
    const result = await controller.execute({
      taskId,
      action: input.action,
      input: input.input || {},
      expectedRevision: input.expectedRevision,
    });
    return json(result);
  };
}


export function createFactoryAutoService({ lifecycle, binding, now, createId, acquireLock, releaseLock } = {}) {
  if (!lifecycle) throw new Error("Factory lifecycle is required");
  return async function factoryAuto(input = {}) {
    const taskId = assertTaskId(input.taskId);
    const state = createStatePort(binding, taskId);
    if (!state) throw Object.assign(new Error("FACTORY_STATE_NOT_CONFIGURED"), { status: 503 });
    const controller = createFactoryController({ lifecycle, state, ...(now ? { now } : {}), ...(createId ? { createId } : {}) });
    const runner = createFactoryAutoRunner({
      loadTask: async () => state.load(),
      executeAction: args => controller.execute(args),
      ...(acquireLock ? { acquireLock } : {}),
      ...(releaseLock ? { releaseLock } : {}),
    });
    const result = await runner.run({
      taskId,
      inputForAction: async action => input.inputs?.[action] || {},
    });
    return json(result, result.status === "DONE" ? 200 : result.status === "BUSY" ? 409 : 202);
  };
}
