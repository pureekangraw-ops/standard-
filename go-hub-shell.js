import { createHubRuntime } from "./go-hub-runtime.js";
import { createCodeCapability } from "./go-hub-code-module.js";

const runtime = createHubRuntime();
runtime.register("Code", createCodeCapability());

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
