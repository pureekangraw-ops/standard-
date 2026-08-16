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

function installLegacyReleaseBridge() {
  const originalStampPackage = globalThis.metropolisStampPackage;
  if (typeof originalStampPackage === "function") {
    globalThis.metropolisStampPackage = pack => {
      const stamped = originalStampPackage(pack);
      const checksum = typeof globalThis.flowChecksum === "function" ? globalThis.flowChecksum : undefined;
      const corrected = restampPackage(stamped, checksum);
      Object.assign(pack, corrected);
      return pack;
    };
  }

  const originalStampAudit = globalThis.metropolisStampAudit;
  if (typeof originalStampAudit === "function") {
    globalThis.metropolisStampAudit = report => {
      const stamped = originalStampAudit(report);
      const corrected = restampAudit(stamped);
      Object.assign(report, corrected);
      return report;
    };
  }

  const originalApplyBranding = globalThis.metropolisApplyBranding;
  if (typeof originalApplyBranding === "function") {
    globalThis.metropolisApplyBranding = (...args) => {
      const result = originalApplyBranding(...args);
      syncVisibleRelease();
      return result;
    };
  }

  const originalApplyPage = globalThis.metropolisApplyPage;
  if (typeof originalApplyPage === "function") {
    globalThis.metropolisApplyPage = (...args) => {
      const result = originalApplyPage(...args);
      syncVisibleRelease();
      return result;
    };
  }
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

installLegacyReleaseBridge();
syncVisibleRelease();
