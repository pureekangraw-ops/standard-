"use strict";

(function normalPocketBootstrap() {
  if (typeof document === "undefined") return;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-normalpocket-script="${src}"]`);
      if (existing?.dataset.loaded === "true") return resolve();
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = src;
        script.async = false;
        script.dataset.normalpocketScript = src;
        document.head.appendChild(script);
      }
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`โหลด ${src} ไม่สำเร็จ`)), { once: true });
    });
  }

  async function start() {
    await loadScript("normalpocket-catalog-core.js");
    await loadScript("normalpocket-products.js");
    await loadScript("normalpocket-reconcile.js");
    await loadScript("normalpocket-simple-flow.js");
  }

  const run = () => start().catch(error => console.error("NORMALPOCKET_BOOTSTRAP_FAILED", error));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
})();
