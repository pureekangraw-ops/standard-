"use strict";

(() => {
  if (typeof document === "undefined") return;

  function loadClassicScript(src) {
    const marker = `script[data-normalpocket-runtime="${src}"]`;
    const existing = document.querySelector(marker);
    if (existing?.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = src;
        script.async = false;
        script.dataset.normalpocketRuntime = src;
        document.head.appendChild(script);
      }
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
      script.addEventListener("error", () => reject(new Error(`โหลด runtime ${src} ไม่สำเร็จ`)), { once: true });
    });
  }

  async function loadCompatibilityRuntime() {
    const compatibility = [
      "normalpocket-state-port.js",
      "normalpocket-store-port.js",
      "normalpocket-sale-ui.js",
      "normalpocket-finance-port.js",
      "normalpocket-installment-ui.js",
      "normalpocket-import-bridge.js",
      "normalpocket-report-bridge.js",
      "normalpocket-flow-calendar-bridge.js",
      "normalpocket-live-source-bridge.js",
      "normalpocket-bootstrap.js"
    ];
    for (const src of compatibility) await loadClassicScript(src);
    if (globalThis.NormalPocketCompatibilityReady) await globalThis.NormalPocketCompatibilityReady;
  }

  globalThis.NormalPocketRuntimeReady = loadCompatibilityRuntime().catch(error => {
    console.error("NORMALPOCKET_COMPATIBILITY_RUNTIME_FAILED", error);
    throw error;
  });
})();
