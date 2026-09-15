import { createHubRuntime } from "./go-hub-runtime.js";
import { createCodeCapability, createCodeTaskSession } from "./go-hub-code-module.js";
import { createLocalStorageKeyValueStore, createStatePersistence } from "./go-hub-persistence.js";
import { createGitHubWorkspace } from "./go-hub-github-workspace.js";
import { createWorkbenchView } from "./go-hub-workbench-model.js";
import { createFactoryRealityReturn, createFactoryWorkContext } from "./go-hub-factory-return.js";
import {
  CENTRE_STATES,
  admitDestination,
  createCentrePassage,
  createCentreSession,
} from "./go-hub-centre.js";

const FACTORY_DESTINATION = "destination://factory";
const runtime = createHubRuntime();
const workspace = createGitHubWorkspace({
  gatewayBase: "/hub/api/github-workspace",
  repository: "pureekangraw-ops/standard-",
});
const taskPersistence = createStatePersistence({
  store: createLocalStorageKeyValueStore({
    storage: globalThis.localStorage,
    namespace: "go-hub-code",
  }),
  key: "active-task",
});
const taskSession = createCodeTaskSession({
  persistence: taskPersistence,
  initial: {
    id: "active-code-task",
    intent: "GO Hub Code workstation",
    repository: workspace.repository,
  },
});
const task = await taskSession.load();
const baseCodeCapability = createCodeCapability({ workspace, task });

const centre = createCentrePassage();
const centrePersistence = createStatePersistence({
  store: createLocalStorageKeyValueStore({
    storage: globalThis.localStorage,
    namespace: "go-hub-centre",
  }),
  key: "active-checkpoint",
});
const centreSession = createCentreSession({
  persistence: centrePersistence,
  passage: centre,
});
let centreWork = await centreSession.load();

const status = document.querySelector("[data-hub-status]");
const list = document.querySelector("[data-hub-capabilities]");
const empty = document.querySelector("[data-hub-empty]");
const workbenchShell = document.querySelector("[data-workbench-shell]");
const centreForm = document.querySelector("[data-centre-form]");
const centreAction = document.querySelector("[data-centre-action]");
const centreError = document.querySelector("[data-centre-error]");

function field(name) {
  return centreForm?.elements.namedItem(name) || null;
}

function createFactoryAccess() {
  return admitDestination(centreWork, {
    destination: FACTORY_DESTINATION,
    capability: baseCodeCapability,
  });
}

function syncFactoryAccess() {
  const shouldOpen = centreWork.status === CENTRE_STATES.AWAY
    && centreWork.handoff?.destination === FACTORY_DESTINATION;
  if (shouldOpen && !runtime.get("Code")) {
    const access = createFactoryAccess();
    const workContext = createFactoryWorkContext(access, task.snapshot());
    runtime.register("Code", createCodeCapability({ workspace, task, workContext }));
  } else if (!shouldOpen && runtime.get("Code")) {
    runtime.unregister("Code");
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
  if (workbenchStatus) workbenchStatus.textContent = view.status || "UNKNOWN";
  if (evidence) {
    evidence.textContent = view.evidence.length
      ? view.evidence.map(item => item.label || item.kind || String(item.value || "evidence")).join(" · ")
      : "—";
  }
  if (next) next.textContent = view.blocker ? `BLOCKED — ${view.blocker}` : (view.next || "—");
}

function renderCentre() {
  document.querySelector("[data-centre-state]").textContent = centreWork.status;
  document.querySelector("[data-centre-checkpoint]").textContent = centreWork.checkpointId;
  document.querySelector("[data-centre-work]").textContent = centreWork.workId;
  document.querySelector("[data-centre-return]").textContent = centreWork.checkpointId;

  field("task").value = centreWork.task || "";
  field("requestedResult").value = centreWork.requestedResult || "";
  field("authority").value = centreWork.authority || "BIG";
  field("lensReference").value = centreWork.lens?.lensReference || "";
  field("fittedView").value = centreWork.lens?.fittedView || "";

  const reviewed = centreWork.status !== CENTRE_STATES.ARRIVED
    && centreWork.status !== CENTRE_STATES.WAIT;
  const fitted = Boolean(centreWork.lens);
  ["task", "requestedResult", "authority"].forEach(name => {
    field(name).disabled = reviewed;
  });
  ["lensReference", "fittedView"].forEach(name => {
    field(name).disabled = !reviewed || fitted;
  });

  const labels = {
    [CENTRE_STATES.ARRIVED]: "Review task",
    [CENTRE_STATES.WAIT]: "Review task",
    [CENTRE_STATES.READY]: fitted ? "Leave for Factory" : "Fit Lens",
    [CENTRE_STATES.AWAY]: "Receive return",
    [CENTRE_STATES.RETURNED]: "Returned to checkpoint",
  };
  centreAction.textContent = labels[centreWork.status] || "Unavailable";
  centreAction.disabled = centreWork.status === CENTRE_STATES.RETURNED;
}

function render() {
  syncFactoryAccess();
  const capabilities = runtime.list();
  status.textContent = centreWork.status === CENTRE_STATES.AWAY
    ? "GO is away from Centre."
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
  renderWorkbench(task.snapshot());
}

centreForm?.addEventListener("submit", async event => {
  event.preventDefault();
  centreError.textContent = "";
  try {
    if (centreWork.status === CENTRE_STATES.ARRIVED || centreWork.status === CENTRE_STATES.WAIT) {
      centreWork = centre.review(centreWork, {
        task: field("task").value,
        requestedResult: field("requestedResult").value,
        authority: field("authority").value,
      });
      await centreSession.save(centreWork, "REVIEW_AT_CENTRE");
    } else if (centreWork.status === CENTRE_STATES.READY && !centreWork.lens) {
      centreWork = centre.fit(centreWork, {
        lensId: field("lensReference").value,
        lensReference: field("lensReference").value,
        fittedView: field("fittedView").value,
      });
      await centreSession.save(centreWork, "FIT_LENS");
    } else if (centreWork.status === CENTRE_STATES.READY) {
      centreWork = centre.leave(centreWork, {
        destination: field("destination").value,
      }).work;
      await centreSession.save(centreWork, "LEAVE_CENTRE");
    } else if (centreWork.status === CENTRE_STATES.AWAY) {
      const access = createFactoryAccess();
      centreWork = centre.return(
        centreWork,
        createFactoryRealityReturn(access, task.snapshot()),
      );
      await centreSession.save(centreWork, "RETURN_TO_CENTRE");
    }
    render();
  } catch (error) {
    centreError.textContent = error instanceof Error ? error.message : String(error);
  }
});

render();
