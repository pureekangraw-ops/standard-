(async () => {
  if (window.top !== window) return;
  const base = browser.runtime.getURL("");
  const [observer, panel] = await Promise.all([
    import(`${base}runtime/go-browser-local-observer.js`),
    import(`${base}observer-panel.js`),
  ]);
  panel.mountObserverPanel({ observer });
})().catch(error => {
  console.error("GO_OBSERVER_BOOT_FAILED", error?.message || String(error));
});
