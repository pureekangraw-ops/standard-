(async () => {
  if (window.top !== window) return;

  const base = browser.runtime.getURL("");
  const [profiles, reader, safeFill, panel] = await Promise.all([
    import(`${base}runtime/go-browser-site-profiles.js`),
    import(`${base}runtime/go-browser-local-reader.js`),
    import(`${base}runtime/go-browser-safe-fill.js`),
    import(`${base}go-browser-panel.js`),
  ]);

  const profile = profiles.profileForUrl(location.href);
  if (!profile) return;

  panel.mountGoBrowserPanel({
    profile,
    scanLocalDocument: reader.scanLocalDocument,
    buildFillPlan: safeFill.buildFillPlan,
    guardAssignment: safeFill.guardAssignment,
    executeFillPlan: safeFill.executeFillPlan,
  });
})().catch(error => {
  console.error("GO_BROWSER_V1_BOOT_FAILED", error?.message || String(error));
});
