"use strict";

(() => {
  function loadStylesheet(href, marker) {
    if (typeof document === "undefined" || document.querySelector(`link[${marker}="true"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(marker, "true");
    document.head.appendChild(link);
  }

  function loadScript(src, marker) {
    if (typeof document === "undefined") return Promise.resolve();
    const existing = document.querySelector(`script[${marker}="true"]`);
    if (existing?.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = src;
        script.async = false;
        script.setAttribute(marker, "true");
        document.head.appendChild(script);
      }
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`โหลด ${src} ไม่สำเร็จ`)), { once: true });
    });
  }

  async function loadMetropolisLayers() {
    if (typeof document === "undefined") return;
    loadStylesheet("metropolis-r5.css", "data-metropolis-r5");
    await loadScript("metropolis-r5.js", "data-metropolis-r5");
    loadStylesheet("metropolis-r5-1.css", "data-metropolis-r5-1");
    await loadScript("metropolis-r5-1.js", "data-metropolis-r5-1");
    loadStylesheet("metropolis-r5-2.css", "data-metropolis-r5-2");
    await loadScript("metropolis-r5-2.js", "data-metropolis-r5-2");
    loadStylesheet("metropolis-r5-3.css", "data-metropolis-r5-3");
    await loadScript("metropolis-r5-3.js", "data-metropolis-r5-3");
    loadStylesheet("metropolis-r5-4.css", "data-metropolis-r5-4");
    await loadScript("metropolis-r5-4.js", "data-metropolis-r5-4");
  }

  async function loadRuntimeLayers() {
    try {
      await loadMetropolisLayers();
      await loadScript("normalpocket-bootstrap.js", "data-normalpocket-bootstrap");
    } catch (error) {
      console.error("NORMALPOCKET_RUNTIME_LOAD_FAILED", error);
    }
  }

  void loadRuntimeLayers();

  const supported = "serviceWorker" in navigator
    && (location.protocol === "https:"
      || ["localhost", "127.0.0.1"].includes(location.hostname));
  if (!supported) return;

  const serviceWorker = navigator.serviceWorker;
  const hadController = Boolean(serviceWorker.controller);
  let reloading = false;

  if (hadController) {
    serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
})();
