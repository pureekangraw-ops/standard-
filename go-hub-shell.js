import { createHubRuntime } from "./go-hub-runtime.js";

const runtime = createHubRuntime();
const status = document.querySelector("[data-hub-status]");
const list = document.querySelector("[data-hub-capabilities]");
const empty = document.querySelector("[data-hub-empty]");

function render() {
  const capabilities = runtime.list();
  status.textContent = "Neutral runtime ready.";
  empty.hidden = capabilities.length > 0;
  list.replaceChildren(
    ...capabilities.map((capability) => {
      const item = document.createElement("li");
      item.textContent = capability.name;
      return item;
    }),
  );
}

render();
