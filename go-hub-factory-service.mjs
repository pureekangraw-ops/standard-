import { createFactoryController } from "./go-hub-factory-controller.mjs";

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

export function createFactoryActionService({ lifecycle, binding, now, createId } = {}) {
  if (!lifecycle) throw new Error("Factory lifecycle is required");
  if (!binding || typeof binding.getByName !== "function") {
    throw Object.assign(new Error("FACTORY_STATE_NOT_CONFIGURED"), { status: 503 });
  }

  return async function factoryAction(input = {}) {
    const taskId = assertTaskId(input.taskId);
    const stub = binding.getByName(taskId);
    const state = Object.freeze({
      load: () => stub.load(),
      save: value => stub.save(value),
    });
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
