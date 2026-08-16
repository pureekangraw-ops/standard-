import { NORMALPOCKET_AUTHORITY } from "./architecture/authority.mjs";
import { NORMALPOCKET_RELEASE, restampPackage, restampAudit } from "./architecture/release-authority.mjs";
import { createShellBoundary } from "./shell/shell-boundary.mjs";
import { createStoreBoundary } from "./store/store-boundary.mjs";
import { createFinanceBoundary } from "./finance/finance-boundary.mjs";
import { createCalendarBoundary } from "./calendar/calendar-boundary.mjs";

await import("../normalpocket-runtime.js");
if (globalThis.NormalPocketRuntimeReady) await globalThis.NormalPocketRuntimeReady;

function syncVisibleRelease() {
  document.title = `${NORMALPOCKET_RELEASE.product} ${NORMALPOCKET_RELEASE.version}`;
  document.documentElement.dataset.normalpocketAuthority = "current";
  document.documentElement.dataset.normalpocketVersion = NORMALPOCKET_RELEASE.version;
  const statusVersion = document.querySelector(".status-line b");
  if (statusVersion) statusVersion.textContent = `v${NORMALPOCKET_RELEASE.version}`;
  const settingsVersion = document.querySelector("#settingsPage .hero-value");
  if (settingsVersion) settingsVersion.textContent = `${NORMALPOCKET_RELEASE.product} ${NORMALPOCKET_RELEASE.version}`;
}

function installCurrentRuntimeHooks() {
  if (!globalThis.YGPHRuntime?.register) return;
  globalThis.YGPHRuntime.register("NORMALPOCKET_CURRENT", {
    afterRender: syncVisibleRelease,
    afterPageChange: syncVisibleRelease,
    exchange(pack) {
      const checksum = typeof globalThis.flowChecksum === "function" ? globalThis.flowChecksum : undefined;
      const corrected = restampPackage(pack, checksum);
      Object.assign(pack, corrected);
      return pack;
    },
    audit(report) {
      const corrected = restampAudit(report);
      Object.assign(report, corrected);
      return report;
    }
  });
}

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
  version: NORMALPOCKET_RELEASE.version,
  release: NORMALPOCKET_RELEASE,
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

installCurrentRuntimeHooks();
syncVisibleRelease();
