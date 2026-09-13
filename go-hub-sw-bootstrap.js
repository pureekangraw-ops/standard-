"use strict";

(() => {
  const supported = "serviceWorker" in navigator
    && (location.protocol === "https:"
      || ["localhost", "127.0.0.1"].includes(location.hostname));
  if (!supported) return;

  navigator.serviceWorker.register("./go-hub-sw.js", {
    scope: "/",
    updateViaCache: "none",
  }).catch(() => {});
})();
