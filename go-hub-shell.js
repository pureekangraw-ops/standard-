import { createHubRuntime } from "./go-hub-runtime.js";
import { createCodeCapability, createCodeTaskSession } from "./go-hub-code-module.js";
import { createLocalStorageKeyValueStore, createStatePersistence } from "./go-hub-persistence.js";
import { createGitHubWorkspace } from "./go-hub-github-workspace.js";
import { createWorkbenchView } from "./go-hub-workbench-model.js";
import { createOperatorView } from "./go-hub-operator-model.js";
import { createFactoryRealityReturn, createFactoryWorkContext } from "./go-hub-factory-return.js";
import { createCityRoute, routeInbound } from "./go-hub-city-route.js";
import { fitWork } from "./go-hub-optician.js";
import { CENTRE_STATES, admitDestination } from "./go-hub-centre.js";
import { createCentreLiveClient } from "./go-hub-centre-client.js";
import { getWorkTarget } from "./go-hub-work-targets.js";

const FACTORY_DESTINATION = "destination://factory";
const cityRoute = createCityRoute();
const runtime = createHubRuntime();

const centreLive = createCentreLiveClient({
  fetchImpl: globalThis.fetch.bind(globalThis),
  storage: globalThis.localStorage,
});

let centreWork = null;
let centreLoadError = null;
let workspace = null;
let task = null;
let baseCodeCapability = null;
let taskLoadError = null;
let activeWorkbenchKey = null;

try {
  centreWork = await centreLive.restoreOrStart();
} catch (error) {
  centreLoadError = error instanceof Error ? error.message : String(error);
}

const status = document.querySelector("[data-hub-status]");
const list = document.querySelector("[data-hub-capabilities]");
const empty = document.querySelector("[data-hub-empty]");
const workbenchShell = document.querySelector("[data-workbench-shell]");
const centreForm = document.querySelector("[data-centre-form]");
const centreAction = document.querySelector("[data-centre-action]");
const centreError = document.querySelector("[data-centre-error]");
const centreTarget = document.querySelector("[data-centre-target]");

function field(name) {
  return centreForm?.elements.namedItem(name) || null;
}

function activeTarget() {
  return getWorkTarget(centreWork?.handoff?.targetId || centreWork?.targetId);
}

function hasActiveWorkbench() {
  return Boolean(
    centreWork?.status === CENTRE_STATES.AWAY &&
    centreWork?.handoff?.destination === FACTORY_DESTINATION &&
    activeTarget() &&
    task &&
    workspace &&
    baseCodeCapability
  );
}

function taskSnapshot() {
  return hasActiveWorkbench() && typeof task.snapshot === "function" ? task.snapshot() : {};
}

function resetWorkbenchMemory() {
  if (runtime.get("Code")) runtime.unregister("Code");
  workspace = null;
  task = null;
  baseCodeCapability = null;
  taskLoadError = null;
  activeWorkbenchKey = null;
}

async function ensureWorkbenchForCentre() {
  const target = activeTarget();
  const shouldOpen = centreWork?.status === CENTRE_STATES.AWAY &&
    centreWork?.handoff?.destination === FACTORY_DESTINATION;

  if (!shouldOpen) {
    resetWorkbenchMemory();
    return;
  }

  if (!target) {
    resetWorkbenchMemory();
    taskLoadError = "WORK_TARGET_REQUIRED";
    return;
  }

  const key = `${centreWork.workId}:${target.id}`;
  if (activeWorkbenchKey === key && task && workspace && baseCodeCapability) return;

  resetWorkbenchMemory();
  activeWorkbenchKey = key;
  workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository: target.repository,
  });

  const taskPersistence = createStatePersistence({
    store: createLocalStorageKeyValueStore({
      storage: globalThis.localStorage,
      namespace: `go-hub-code:${target.id}`,
    }),
    key: `work:${centreWork.workId}`,
  });
  const taskSession = createCodeTaskSession({
    persistence: taskPersistence,
    initial: {
      id: `code:${centreWork.workId}`,
      intent: centreWork.task || `GO Hub work for ${target.label}`,
      repository: workspace.repository,
    },
  });

  try {
    task = await taskSession.load();
    if (task.snapshot().repository !== target.repository) {
      throw new Error("WORKBENCH_TARGET_MISMATCH");
    }
    baseCodeCapability = createCodeCapability({ workspace, task });
  } catch (error) {
    taskLoadError = error instanceof Error ? error.message : String(error);
    task = null;
    baseCodeCapability = null;
  }
}

await ensureWorkbenchForCentre();

function assertWorkbenchReady() {
  if (!hasActiveWorkbench()) {
    throw new Error(taskLoadError || "WORKBENCH_STATE_UNAVAILABLE");
  }
}

function createFactoryAccess() {
  assertWorkbenchReady();
  return admitDestination(centreWork, {
    destination: FACTORY_DESTINATION,
    capability: baseCodeCapability,
  });
}

function fitFactoryRoute() {
  const destination = String(field("destination")?.value || "").trim();
  const canonicalFactory = cityRoute.destinations.factory;
  if (destination !== FACTORY_DESTINATION || destination !== canonicalFactory.route) {
    throw new Error("Factory destination does not match canonical city route");
  }
  if (!getWorkTarget(centreWork?.targetId || field("targetId")?.value)) {
    throw new Error("WORK_TARGET_REQUIRED");
  }
  const fit = fitWork({
    context: {
      purpose: centreWork.task,
      successCondition: centreWork.requestedResult,
    },
    reality: { targetId: centreWork.targetId || null },
    role: { reference: centreWork.persona?.personaReference },
    destination: canonicalFactory,
  });
  if (fit.gate !== "PASS") {
    throw new Error(`Optician gate did not pass: ${fit.missing?.join(", ") || "UNKNOWN"}`);
  }
  const route = routeInbound({ fit });
  if (route.destination !== "go-work-loop" || route.workRoute !== destination) {
    throw new Error("Canonical city route did not admit Factory destination");
  }
  return Object.freeze({ fit, route, destination });
}

function syncFactoryAccess() {
  if (!hasActiveWorkbench()) {
    if (runtime.get("Code")) runtime.unregister("Code");
    return;
  }
  if (!runtime.get("Code")) {
    const access = createFactoryAccess();
    const workContext = createFactoryWorkContext(access, taskSnapshot());
    runtime.register("Code", createCodeCapability({ workspace, task, workContext }));
  }
}

function renderWorkbench(snapshot) {
  const view = createWorkbenchView(snapshot || {});
  const mission = document.querySelector("[data-workbench-mission]");
  const blueprint = document.querySelector("[data-workbench-blueprint]");
  const piece = document.querySelector("[data-workbench-piece]");
  const workbenchStatus = document.querySelector("[data-workbench-status]");
  const evidence = document.querySelector("[data-workbench-evidence]");
  const next = document.querySelector("[data-workbench-next]");

  if (mission) mission.textContent = view.mission?.summary || "—";
  if (blueprint) blueprint.textContent = view.blueprint?.title || view.blueprint?.ref || "—";
  if (piece) piece.textContent = view.currentPiece?.title || view.currentPiece?.id || "—";
  if (workbenchStatus) workbenchStatus.textContent = hasActiveWorkbench() ? (view.status || "UNKNOWN") : "IDLE";
  if (evidence) {
    evidence.textContent = view.evidence.length
      ? view.evidence.map(item => item.label || item.kind || String(item.value || "evidence")).join(" · ")
      : "—";
  }
  if (next) next.textContent = hasActiveWorkbench()
    ? (view.blocker ? `BLOCKED — ${view.blocker}` : (view.next || "—"))
    : "NO ACTIVE WORK";
}

function renderOperator(snapshot) {
  if (!hasActiveWorkbench()) {
    const idle = {
      state: "IDLE",
      repository: null,
      base: null,
      "work-branch": null,
      head: null,
      pr: null,
      ci: null,
      deploy: null,
      verification: null,
      blocker: taskLoadError,
      "next-action": "NO ACTIVE WORK",
    };
    for (const [key, value] of Object.entries(idle)) {
      const node = document.querySelector(`[data-code-${key}]`);
      if (node) node.textContent = value || "—";
    }
    return;
  }

  const view = createOperatorView(snapshot || {});
  const values = {
    state: view.state,
    repository: view.repository,
    base: view.base,
    "work-branch": view.workBranch,
    head: view.head,
    pr: view.pullRequest,
    ci: view.ci,
    deploy: view.deploy,
    verification: view.verification,
    blocker: view.interruption?.state || view.blocker,
    "next-action": view.interruption?.actions?.join(" · ") || view.next,
  };
  for (const [key, value] of Object.entries(values)) {
    const node = document.querySelector(`[data-code-${key}]`);
    if (node) node.textContent = value || "—";
  }
}

function renderCentre() {
  if (!centreWork) {
    document.querySelector("[data-centre-state]").textContent = "UNAVAILABLE";
    document.querySelector("[data-centre-checkpoint]").textContent = "—";
    document.querySelector("[data-centre-work]").textContent = "—";
    document.querySelector("[data-centre-return]").textContent = "—";
    if (centreTarget) centreTarget.textContent = "—";
    centreAction.textContent = "Centre unavailable";
    centreAction.disabled = true;
    centreError.textContent = centreLoadError || "CENTRE_LIVE_UNAVAILABLE";
    return;
  }

  document.querySelector("[data-centre-state]").textContent = centreWork.status;
  document.querySelector("[data-centre-checkpoint]").textContent = centreWork.checkpointId;
  document.querySelector("[data-centre-work]").textContent = centreWork.workId;
  document.querySelector("[data-centre-return]").textContent = centreWork.checkpointId;

  field("task").value = centreWork.task || "";
  field("requestedResult").value = centreWork.requestedResult || "";
  field("authority").value = centreWork.authority || "BIG";
  field("targetId").value = centreWork.targetId || "";
  field("personaReference").value = centreWork.persona?.personaReference || "";
  field("workingView").value = centreWork.persona?.workingView || "";

  const target = getWorkTarget(centreWork.targetId);
  if (centreTarget) centreTarget.textContent = target?.label || "—";

  const reviewed = centreWork.status !== CENTRE_STATES.ARRIVED
    && centreWork.status !== CENTRE_STATES.WAIT;
  const fitted = Boolean(centreWork.persona);

  ["task", "requestedResult", "authority", "targetId"].forEach(name => {
    field(name).disabled = reviewed;
  });
  ["personaReference", "workingView"].forEach(name => {
    field(name).disabled = !reviewed || fitted;
    field(name).required = reviewed && !fitted && centreWork.status === CENTRE_STATES.READY;
  });

  const leaveTarget = target?.label || "selected target";
  const labels = {
    [CENTRE_STATES.ARRIVED]: "Review task",
    [CENTRE_STATES.WAIT]: "Review task",
    [CENTRE_STATES.READY]: fitted ? `Leave for ${leaveTarget} via Factory` : "Fit Role",
    [CENTRE_STATES.AWAY]: "Receive return",
    [CENTRE_STATES.RETURNED]: "Returned to checkpoint",
  };
  centreAction.textContent = labels[centreWork.status] || "Unavailable";
  centreAction.disabled = centreWork.status === CENTRE_STATES.RETURNED;
}

function render() {
  syncFactoryAccess();
  const capabilities = runtime.list();
  const target = activeTarget();
  status.textContent = !centreWork
    ? "Centre live unavailable."
    : centreWork.status === CENTRE_STATES.AWAY
      ? taskLoadError
        ? "GO is away from Centre. Workbench target unavailable."
        : `GO is working on ${target?.label || "target"} via Factory.`
      : "GO is at Centre.";

  empty.hidden = capabilities.length > 0;
  workbenchShell.hidden = !runtime.get("Code");
  list.replaceChildren(
    ...capabilities.map(({ name, capability }) => {
      const item = document.createElement("li");
      const title = capability.title || name;
      const state = capability.status ? ` — ${capability.status}` : "";
      item.textContent = `${title}${state}`;
      item.dataset.capability = capability.id || name;
      return item;
    }),
  );
  renderCentre();
  renderWorkbench(taskSnapshot());
  renderOperator(taskSnapshot());
}

centreForm?.addEventListener("submit", async event => {
  event.preventDefault();
  centreError.textContent = "";
  try {
    if (!centreWork) throw new Error("CENTRE_LIVE_UNAVAILABLE");
    const identity = {
      workId: centreWork.workId,
      checkpointId: centreWork.checkpointId,
      returnAddress: centreWork.checkpointId,
    };

    if (centreWork.status === CENTRE_STATES.ARRIVED || centreWork.status === CENTRE_STATES.WAIT) {
      const target = getWorkTarget(field("targetId").value);
      if (!target) throw new Error("WORK_TARGET_REQUIRED");
      centreWork = await centreLive.command({
        action: "review",
        ...identity,
        task: field("task").value,
        requestedResult: field("requestedResult").value,
        authority: field("authority").value,
        targetId: target.id,
      });
    } else if (centreWork.status === CENTRE_STATES.READY && !centreWork.persona) {
      centreWork = await centreLive.command({
        action: "fit",
        ...identity,
        personaId: field("personaReference").value,
        personaReference: field("personaReference").value,
        workingView: field("workingView").value,
      });
    } else if (centreWork.status === CENTRE_STATES.READY) {
      const route = fitFactoryRoute();
      centreWork = await centreLive.command({
        action: "leave",
        ...identity,
        destination: route.destination,
        targetId: centreWork.targetId,
      });
      await ensureWorkbenchForCentre();
    } else if (centreWork.status === CENTRE_STATES.AWAY) {
      const access = createFactoryAccess();
      const packet = createFactoryRealityReturn(access, taskSnapshot());
      centreWork = await centreLive.command({
        action: "return",
        ...identity,
        payload: packet.payload,
      });
      await ensureWorkbenchForCentre();
    }

    render();
  } catch (error) {
    centreError.textContent = error instanceof Error ? error.message : String(error);
  }
});

render();
