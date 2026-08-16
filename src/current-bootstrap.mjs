import { NORMALPOCKET_AUTHORITY } from "./architecture/authority.mjs";
import { createShellBoundary } from "./shell/shell-boundary.mjs";
import { createStoreBoundary } from "./store/store-boundary.mjs";
import { createFinanceBoundary } from "./finance/finance-boundary.mjs";
import { createCalendarBoundary } from "./calendar/calendar-boundary.mjs";

const shell = createShellBoundary({
  navigate(page) {
    if (typeof globalThis.showPage === "function") return globalThis.showPage(page);
    document.querySelectorAll(".page").forEach(node => {
      node.classList.toggle("active", node.id === `${page}Page`);
    });
    return page;
  }
});

const architecture = Object.freeze({
  version: "1.3.1",
  authority: NORMALPOCKET_AUTHORITY,
  shell,
  store: createStoreBoundary(),
  finance: createFinanceBoundary(),
  calendar: createCalendarBoundary()
});

Object.defineProperty(globalThis, "NormalPocketArchitecture", {
  value: architecture,
  configurable: false,
  enumerable: true,
  writable: false
});

document.documentElement.dataset.normalpocketAuthority = "current";
document.documentElement.dataset.normalpocketVersion = architecture.version;
