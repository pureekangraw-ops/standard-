import { createHubRuntime } from "./go-hub-runtime.js";
import { createCodeCapability, createCodeTaskSession } from "./go-hub-code-module.js";
import { createLocalStorageKeyValueStore, createStatePersistence } from "./go-hub-persistence.js";
import { createGitHubWorkspace } from "./go-hub-github-workspace.js";
import { createWorkbenchView } from "./go-hub-workbench-model.js";
import { CENTRE_STATES, admitDestination, createCentrePassage, createCentreSession } from "./go-hub-centre.js";
import { createFactoryRealityReturn, createFactoryWorkContext } from "./go-hub-factory-return.js";
import { createCityRoute, routeInbound, routeOutbound } from "./go-hub-city-route.js";
import { fitWork } from "./go-hub-optician.js";

const city = createCityRoute();
const runtime = createHubRuntime();
const workspace = createGitHubWorkspace({ gatewayBase: "/hub/api/github-workspace", repository: "pureekangraw-ops/standard-" });
const taskSession = createCodeTaskSession({
  persistence: createStatePersistence({ store: createLocalStorageKeyValueStore({ storage: globalThis.localStorage, namespace: "go-hub-code" }), key: "active-task" }),
  initial: { id: "active-code-task", intent: "GO Hub Code workstation", repository: workspace.repository },
});
const task = await taskSession.load();
const codeCapability = createCodeCapability({ workspace, task });
const centre = createCentrePassage();
const centreSession = createCentreSession({
  persistence: createStatePersistence({ store: createLocalStorageKeyValueStore({ storage: globalThis.localStorage, namespace: "go-hub-centre" }), key: "active-checkpoint" }),
  passage: centre,
});
let centreWork = await centreSession.load();
let lastPassage = null;

const q = selector => document.querySelector(selector);
const status = q("[data-hub-status]");
const list = q("[data-hub-capabilities]");
const empty = q("[data-hub-empty]");
const workbenchShell = q("[data-workbench-shell]");
const centreForm = q("[data-centre-form]");
const centreAction = q("[data-centre-action]");
const centreError = q("[data-centre-error]");
const field = name => centreForm?.elements.namedItem(name) || null;

function heimdall() {
  return String(centreWork.authority || "").trim()
    ? { decision: "PASS" }
    : { decision: "WAIT", reason: "AUTHORITY_REQUIRED" };
}

function currentFit() {
  return fitWork({
    context: {
      purpose: centreWork.task,
      target: workspace.repository,
      action: "factory",
      successCondition: centreWork.requestedResult,
    },
    reality: task.snapshot(),
    lens: { reference: centreWork.lens?.lensReference },
    destination: city.destinations.factory,
  });
}

function factoryAccess(capability = codeCapability) {
  return admitDestination(centreWork, { destination: city.destinations.factory.route, capability });
}

function syncFactoryAccess() {
  const open = centreWork.status === CENTRE_STATES.AWAY && centreWork.handoff?.destination === city.destinations.factory.route;
  if (open && !runtime.get("Code")) {
    const access = factoryAccess();
    const workContext = createFactoryWorkContext(access, task.snapshot());
    runtime.register("Code", createCodeCapability({ workspace, task, workContext }));
  } else if (!open && runtime.get("Code")) runtime.unregister("Code");
}

function renderWorkbench(snapshot) {
  const view = createWorkbenchView(snapshot || {});
  const values = {
    "[data-workbench-mission]": view.mission?.summary || "—",
    "[data-workbench-blueprint]": view.blueprint?.title || view.blueprint?.ref || "—",
    "[data-workbench-piece]": view.currentPiece?.title || view.currentPiece?.id || "—",
    "[data-workbench-status]": view.status || "UNKNOWN",
    "[data-workbench-evidence]": view.evidence.length ? view.evidence.map(item => item.label || item.kind || String(item.value || "evidence")).join(" · ") : "—",
    "[data-workbench-next]": view.blocker ? `BLOCKED — ${view.blocker}` : (view.next || "—"),
  };
  Object.entries(values).forEach(([selector, value]) => { const node = q(selector); if (node) node.textContent = value; });
}

function renderCentre() {
  q("[data-centre-state]").textContent = centreWork.status;
  q("[data-centre-checkpoint]").textContent = centreWork.checkpointId;
  q("[data-centre-work]").textContent = centreWork.workId;
  q("[data-centre-return]").textContent = centreWork.checkpointId;
  field("task").value = centreWork.task || "";
  field("requestedResult").value = centreWork.requestedResult || "";
  field("authority").value = centreWork.authority || "BIG";
  field("lensReference").value = centreWork.lens?.lensReference || "";
  field("fittedView").value = centreWork.lens?.fittedView || "";
  const reviewed = ![CENTRE_STATES.ARRIVED, CENTRE_STATES.WAIT].includes(centreWork.status);
  const fitted = Boolean(centreWork.lens);
  ["task", "requestedResult", "authority"].forEach(name => { field(name).disabled = reviewed; });
  ["lensReference", "fittedView"].forEach(name => { field(name).disabled = !reviewed || fitted; });
  const labels = { ARRIVED: "Review task", WAIT: "Review task", READY: fitted ? "Enter GO City" : "Fit Lens", AWAY: "Receive return", RETURNED: "Returned to checkpoint" };
  centreAction.textContent = labels[centreWork.status] || "Unavailable";
  centreAction.disabled = centreWork.status === CENTRE_STATES.RETURNED;
}

function render() {
  syncFactoryAccess();
  const capabilities = runtime.list();
  status.textContent = lastPassage?.destination === "bifrost"
    ? "Heimdall passed. Bifröst is open to Chat."
    : centreWork.status === CENTRE_STATES.AWAY ? "GO is working inside the city." : "GO is at the Hub checkpoint.";
  empty.hidden = capabilities.length > 0;
  workbenchShell.hidden = !runtime.get("Code");
  list.replaceChildren(...capabilities.map(({ name, capability }) => {
    const item = document.createElement("li");
    item.textContent = `${capability.title || name}${capability.status ? ` — ${capability.status}` : ""}`;
    item.dataset.capability = capability.id || name;
    return item;
  }));
  renderCentre();
  renderWorkbench(task.snapshot());
}

centreForm?.addEventListener("submit", async event => {
  event.preventDefault();
  centreError.textContent = "";
  try {
    if ([CENTRE_STATES.ARRIVED, CENTRE_STATES.WAIT].includes(centreWork.status)) {
      centreWork = centre.review(centreWork, { task: field("task").value, requestedResult: field("requestedResult").value, authority: field("authority").value });
      await centreSession.save(centreWork, "REVIEW_AT_CENTRE");
    } else if (centreWork.status === CENTRE_STATES.READY && !centreWork.lens) {
      centreWork = centre.fit(centreWork, { lensId: field("lensReference").value, lensReference: field("lensReference").value, fittedView: field("fittedView").value });
      await centreSession.save(centreWork, "FIT_LENS");
    } else if (centreWork.status === CENTRE_STATES.READY) {
      const passage = routeInbound({ fit: currentFit(), heimdall: heimdall() });
      if (passage.destination !== "go-work-loop" || !passage.workRoute) throw new Error(passage.reason || "CITY_ENTRY_WAIT");
      lastPassage = passage;
      centreWork = centre.leave(centreWork, { destination: passage.workRoute }).work;
      await centreSession.save(centreWork, "LEAVE_CENTRE");
    } else if (centreWork.status === CENTRE_STATES.AWAY) {
      const access = factoryAccess(runtime.get("Code") || codeCapability);
      centreWork = centre.return(centreWork, createFactoryRealityReturn(access, task.snapshot()));
      lastPassage = routeOutbound({ heimdall: heimdall(), needsOptician: false });
      await centreSession.save(centreWork, "RETURN_TO_CENTRE");
    }
    render();
  } catch (error) {
    centreError.textContent = error instanceof Error ? error.message : String(error);
  }
});

render();
