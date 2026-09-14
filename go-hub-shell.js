import { createHubRuntime } from "./go-hub-runtime.js";
import { createCodeCapability, createCodeTaskSession } from "./go-hub-code-module.js";
import { createLocalStorageKeyValueStore, createStatePersistence } from "./go-hub-persistence.js";
import { createGitHubWorkspace } from "./go-hub-github-workspace.js";

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
const session = createCodeTaskSession({
  persistence: taskPersistence,
  initial: {
    id: "active-code-task",
    intent: "GO Hub Code workstation",
    repository: workspace.repository,
  },
});
const task = await session.load();
runtime.register("Code", createCodeCapability({ workspace, task }));

const status = document.querySelector("[data-hub-status]");
const list = document.querySelector("[data-hub-capabilities]");
const empty = document.querySelector("[data-hub-empty]");

function render() {
  const capabilities = runtime.list();
  status.textContent = "Neutral runtime ready.";
  empty.hidden = capabilities.length > 0;
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
}

render();
